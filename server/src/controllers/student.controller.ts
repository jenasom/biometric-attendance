import type { Request, Response, NextFunction } from 'express';
import { createSuccess } from '../helpers/http.helper';
import createError from 'http-errors';
import * as crypto from 'crypto';
import { normalizeBase64, fingerprintHashFromBase64, bufferFromBase64 } from '../helpers/fingerprint.helper';
import {
  removeStudentFromDb,
  saveStudentToDb,
  updateStudentInDb,
  saveStudentCoursesToDb,
  checkIfStudentExists,
  removeAllStudentCoursesToDb,
} from '../services/student.service';
import { sendWelcomeEmail, sendAttendanceConfirmationEmail } from '../services/email.service';
import { prisma } from '../db/prisma-client';
import type { Student } from '@prisma/client';
import type { PaginationMeta } from '../interfaces/helper.interface';
import type { StudentCreateInput, StudentUpdateInput, StudentDTO } from '../interfaces/student.interface';
import { getStudentCourses } from '../services/student.service';

export const getStudents = async (req: Request, res: Response, next: NextFunction) => {
  // get students that belongs to single staff
  const { staff_id } = req.params;
  const { per_page, page } = req.query;
  if (!staff_id) return next(new createError.BadRequest('Staff ID is required'));
  if (!per_page || !page) return next(new createError.BadRequest('Pagination info is required'));
  try {
    const studentCount = await prisma.student.count({
      where: {
        staff_id,
      },
    });
    const students = await prisma.student.findMany({
      where: {
        staff_id,
      },
      skip: (Number(page) - 1) * Number(per_page),
      take: Number(per_page),
      orderBy: {
        created_at: 'desc',
      },
      include: {
        courses: {
          include: {
            course: {
              select: {
                id: true,
                course_name: true,
                course_code: true,
              },
            },
          },
        },
      },
    });
    const meta: PaginationMeta = {
      total_items: studentCount,
      total_pages: Math.ceil(studentCount / Number(per_page)) || 1,
      page: Number(page),
      per_page: Number(per_page),
    };
    const studentToSend = students.map((item) => ({
      ...item,
      // Convert stored fingerprint Buffer to base64 so the client receives a usable string
      fingerprint: item.fingerprint ? Buffer.from(item.fingerprint).toString('base64') : '',
      courses: item.courses.map((course) => course.course),
    }));
    return createSuccess(res, 200, 'Student fetched successfully', { students: studentToSend, meta });
  } catch (err) {
    return next(err);
  }
};

export const getSingleStudent = async (req: Request, res: Response, next: NextFunction) => {
  // get students that belongs to single staff
  const { id } = req.params;
  if (!id) return next(new createError.BadRequest('Student ID is required'));
  try {
    const student = await prisma.student.findUnique({
      where: {
        id,
      },
      include: {
        courses: {
          include: {
            course: {
              select: {
                id: true,
                course_name: true,
                course_code: true,
              },
            },
          },
        },
      },
    });
    if (!student) throw new createError.NotFound('Student not found');
    const studentToSend = {
      ...student,
      fingerprint: student.fingerprint ? Buffer.from(student.fingerprint).toString('base64') : '',
      courses: student.courses.map((item) => item.course),
    };
    return createSuccess(res, 200, 'Student fetched successfully', { student: studentToSend });
  } catch (err) {
    return next(err);
  }
};

export const createStudent = async (req: Request, res: Response, next: NextFunction) => {
  // create student
  const { name, staff_id, matric_no, email, fingerprint, courses } = req.body as StudentCreateInput;

  if (!staff_id) return next(new createError.BadRequest('No staff ID provided'));

  if (!matric_no) {
    return next(createError(400, 'The matric_no field is required.'));
  }
  // Use shared normalizeBase64 from helper

  try {
    const courseExists = await checkIfStudentExists(matric_no, staff_id);
    if (courseExists) {
      return next(
        createError(
          400,
          ...[
            {
              message: 'Student with the same matric number already exists.',
              errorType: 'STUDENT_ALREADY_EXISTS',
            },
          ],
        ),
      );
    }

    // Normalize and convert base64 to Uint8Array for BLOB storage
    const normalizedFingerprint = normalizeBase64(fingerprint);
    const fingerprintData = bufferFromBase64(normalizedFingerprint);

    // Compute SHA-256 hash for debugging / dedupe checks
    const fingerprintHash = fingerprintHashFromBase64(normalizedFingerprint);
    console.log(`Registering student fingerprint hash=${fingerprintHash}, matric=${matric_no}`);

    // Prevent duplicate fingerprint registration using fingerprint_hash
    const existingByHash = await prisma.student.findFirst({
      where: { fingerprint_hash: fingerprintHash },
      select: { id: true, name: true, matric_no: true },
    });
    if (existingByHash) {
      return next(
        createError(400, ...[
          {
            message: 'A student with the same fingerprint already exists.',
            errorType: 'STUDENT_FINGERPRINT_ALREADY_EXISTS',
          },
        ]),
      );
    }

    // Generate an email using matric number if not provided
    const studentEmail = email || `${matric_no.toLowerCase()}@student.edu`;
    
    const newStudent = { 
      staff_id, 
      name,
      email: studentEmail,
      matric_no, 
      fingerprint: fingerprintData,  // Store as Uint8Array for BLOB
      fingerprint_hash: fingerprintHash,
      created_at: new Date() 
    };

    const savedStudent = await saveStudentToDb(newStudent);
    await saveStudentCoursesToDb(courses.map((course_id) => ({ course_id, student_id: savedStudent.id })));
    const studentCourses = await getStudentCourses(savedStudent.id);
    
    // Send welcome email
    try {
        await sendWelcomeEmail(studentEmail, name);
    } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail the request if email fails
    }

    // Convert Buffer back to base64 for response
    const savedStudentWithBase64 = {
      ...savedStudent,
      fingerprint: Buffer.from(savedStudent.fingerprint).toString('base64'),
    };

    return createSuccess(res, 200, 'Student created successfully', {
      student: { ...savedStudentWithBase64, courses: studentCourses.map((item) => item.course) },
    });
  } catch (err) {
    return next(err);
  }
};

export const updateStudent = async (req: Request, res: Response, next: NextFunction) => {
  // update student
  const { id } = req.params;
  if (!id) return next(createError(400, 'No student ID provided'));
  const { courses, fingerprint, ...newUpdate } = req.body as StudentUpdateInput;
  
  try {
    // Handle fingerprint update if provided
    let fingerprintUpdate = {};
    if (fingerprint) {
      const fingerprintData = Buffer.from(fingerprint, 'base64');
      fingerprintUpdate = { fingerprint: fingerprintData };
    }

    // Update courses only if provided
    if (courses && courses.length > 0) {
      await removeAllStudentCoursesToDb(id);
      await saveStudentCoursesToDb(courses.map((course_id) => ({ course_id, student_id: id })));
    }

    const updatedStudent = await updateStudentInDb(id, { ...newUpdate, ...fingerprintUpdate });
    const studentCourses = await getStudentCourses(id);

    // Convert Buffer back to base64 for response
    const updatedStudentWithBase64 = {
      ...updatedStudent,
      fingerprint: Buffer.from(updatedStudent.fingerprint).toString('base64')
    };

    return createSuccess(res, 200, 'Student updated successfully', {
      student: { ...updatedStudentWithBase64, courses: studentCourses.map((item) => item.course) },
    });
  } catch (err) {
    return next(err);
  }
};

export const deleteStudent = async (req: Request, res: Response, next: NextFunction) => {
  // delete student
  const { id } = req.params;
  if (!id) return next(createError(400, 'No student ID provided'));
  try {
    await removeAllStudentCoursesToDb(id);
    await removeStudentFromDb(id);
    return createSuccess(res, 200, 'Student deleted successfully', { deleted: true });
  } catch (err) {
    return next(err);
  }
};
