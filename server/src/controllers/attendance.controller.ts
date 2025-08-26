import type { Request, Response, NextFunction } from 'express';
import { createSuccess } from '../helpers/http.helper';
import createError from 'http-errors';
import fetch from 'node-fetch';
import {
  removeAttendanceFromDb,
  saveAttendanceToDb,
  updateAttendanceInDb,
  fetchOneAttendance,
  removeAllStudentAttendance,
} from '../services/attendance.service';
import { sendAttendanceConfirmationEmail, sendMissedAttendanceEmail } from '../services/email.service';
import { prisma } from '../db/prisma-client';
import type { Attendance, StudentAttendance } from '@prisma/client';
import type { PaginationMeta } from '../interfaces/helper.interface';
import { markStudentAttendance, fetchAttendanceStudents, checkIfStudentIsMarked } from '../services/attendance.service';
import * as crypto from 'crypto';
import { normalizeBase64 } from '../helpers/fingerprint.helper';

export const getAttendances = async (req: Request, res: Response, next: NextFunction) => {
  // get attendances that belongs to single staff
  const { staff_id } = req.params;
  const { per_page, page } = req.query;
  if (!staff_id) return next(new createError.BadRequest('Staff ID is required'));
  if (!per_page || !page) return next(new createError.BadRequest('Pagination info is required'));
  try {
    const attendanceCount = await prisma.attendance.count({
      where: {
        staff_id,
      },
    });
    const attendances = await prisma.attendance.findMany({
      where: {
        staff_id,
      },
      skip: (Number(page) - 1) * Number(per_page),
      take: (Number(page) - 1) * Number(per_page) + Number(per_page),
      orderBy: {
        created_at: 'desc',
      },
      include: {
        course: {
          select: {
            id: true,
            course_code: true,
            course_name: true,
          },
        },
      },
    });
    const meta: PaginationMeta = {
      total_items: attendanceCount,
      total_pages: Math.ceil(attendanceCount / Number(per_page)) || 1,
      page: Number(page),
      per_page: Number(per_page),
    };

    return createSuccess(res, 200, 'Attendance fetched successfully', { attendances, meta });
  } catch (err) {
    return next(err);
  }
};

export const getAttendanceList = async (req: Request, res: Response, next: NextFunction) => {
  const { attendance_id } = req.params;
  if (!attendance_id) return next(new createError.BadRequest('Attendance ID is required'));
  try {
    const attendanceList = await fetchAttendanceStudents(attendance_id);
    return createSuccess(res, 200, 'Attendance fetched successfully', { attendanceList });
  } catch (err) {
    return next(err);
  }
};

export const getSingleAttendance = async (req: Request, res: Response, next: NextFunction) => {
  // get attendances that belongs to single staff
  const { id } = req.params;
  if (!id) return next(new createError.BadRequest('Attendance ID is required'));
  try {
    const attendance = await fetchOneAttendance(id);
    return createSuccess(res, 200, 'Attendance fetched successfully', { attendance });
  } catch (err) {
    return next(err);
  }
};

export const addStudentToAttendance = async (req: Request, res: Response, next: NextFunction) => {
  // create attendance
  const { attendance_id, student_id } = req.body as StudentAttendance & {
    fingerprintSample?: string; // optional Base64 string of captured fingerprint
  };

  if (!attendance_id || !student_id) {
    return next(new createError.BadRequest('No attendance ID or student ID provided'));
  }


  try {
    // First check if student is already marked
    const isMarked = await checkIfStudentIsMarked({ attendance_id, student_id });
    if (isMarked) {
      return next(createError(400, ...[{
        message: 'Student has already been marked.',
        errorType: 'STUDENT_ALREADY_MARKED',
      }]));
    }

    // Get attendance details with course info
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendance_id },
      include: {
        course: true
      }
    });

    if (!attendance) {
      return next(createError(404, 'Attendance session not found'));
    }

    // Get student with course enrollments
    const student = await prisma.student.findUnique({
      where: { id: student_id },
      include: {
        courses: {
          include: {
            course: true
          }
        }
      }
    });

    if (!student) {
      return next(createError(404, 'Student not found'));
    }

    // Check if student is enrolled in the course
    const isEnrolled = student.courses.some(enrollment => enrollment.course_id === attendance.course_id);
    if (!isEnrolled) {
      return next(createError(400, ...[{
        message: 'Student is not enrolled in this course',
        errorType: 'STUDENT_NOT_ENROLLED',
      }]));
    }

  // Convert stored fingerprint to base64 and normalize
  const storedFingerprintRaw = Buffer.from(student.fingerprint).toString('base64');
  const storedFingerprint = normalizeBase64(storedFingerprintRaw);

  // Bypass fingerprint verification: accept any fingerprint sample and mark attendance
  // (Per request: accept every fingerprint)
  await markStudentAttendance({ attendance_id, student_id });

    // Get student and course details for email
    const attendanceDetails = await prisma.attendance.findUnique({
      where: { id: attendance_id },
      include: {
        course: true
      }
    });

    const studentDetails = await prisma.student.findUnique({
      where: { id: student_id },
      select: {
        name: true,
        email: true
      }
    });

  if (attendanceDetails && studentDetails) {
      try {
        await sendAttendanceConfirmationEmail(
          studentDetails.email,
          studentDetails.name,
          attendanceDetails.course.course_name,
          attendanceDetails.course.course_code,
          attendanceDetails.date
        );
      } catch (emailError) {
        console.error('Failed to send attendance confirmation email:', emailError);
        // Don't fail the request if email fails
      }
    }
    return createSuccess(res, 200, 'Attendance marked successfully', {
      marked: true,
      verification: {
        bypassed: true,
      }
    });
  } catch (err) {
    return next(err);
  }
};

export const endAttendance = async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  if (!id) return next(new createError.BadRequest('Attendance ID is required'));

  try {
    // Fetch the attendance to get course info
    const attendance = await prisma.attendance.findUnique({ where: { id }, include: { course: true } });
    if (!attendance) return next(createError(404, 'Attendance session not found'));

    // Fetch all students enrolled in the course
    const enrolledStudents = await prisma.student.findMany({
      where: {
        courses: {
          some: {
            course_id: attendance.course_id,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Fetch all marked student IDs for this attendance
    const marked = await prisma.studentAttendance.findMany({ where: { attendance_id: id }, select: { student_id: true } });
    const markedIds = new Set(marked.map(m => m.student_id));

    // Determine absent students
    const absentStudents = enrolledStudents.filter(s => !markedIds.has(s.id));

    // Send email to each absent student (fire-and-forget, but await to log failures)
    const results = [] as Array<{ studentId: string; emailed: boolean }>;
    for (const student of absentStudents) {
      try {
        const emailed = await sendMissedAttendanceEmail(student.email, student.name, attendance.course.course_name, attendance.course.course_code, attendance.date);
        results.push({ studentId: student.id, emailed });
      } catch (emailErr) {
        console.error('Failed to email absent student', student.id, emailErr);
        results.push({ studentId: student.id, emailed: false });
      }
    }

    return createSuccess(res, 200, 'End attendance processed', { absentCount: absentStudents.length, results });
  } catch (err) {
    return next(err);
  }
};

export const createAttendance = async (req: Request, res: Response, next: NextFunction) => {
  // create attendance
  const { name, staff_id, course_id, date } = req.body as Omit<Attendance, 'id' | 'created_at'>;

  if (!staff_id || !course_id) return next(new createError.BadRequest('No staff ID or course ID provided'));

  try {
    const newAttendance = { staff_id, course_id, name, date, created_at: new Date() };
    const savedAttendance = await saveAttendanceToDb(newAttendance);
    const attendanceToSend = await fetchOneAttendance(savedAttendance.id);
    return createSuccess(res, 200, 'Attendance created successfully', {
      attendance: attendanceToSend,
    });
  } catch (err) {
    return next(err);
  }
};

export const updateAttendance = async (req: Request, res: Response, next: NextFunction) => {
  // update attendance
  const { id } = req.params;
  if (!id) return next(createError(400, 'No attendance ID provided'));
  const newUpdate = req.body as Partial<Attendance>;
  try {
    const updatedAttendance = await updateAttendanceInDb(id, newUpdate);
    return createSuccess(res, 200, 'Attendance updated successfully', { attendance: updatedAttendance });
  } catch (err) {
    return next(err);
  }
};

export const deleteAttendance = async (req: Request, res: Response, next: NextFunction) => {
  // delete attendance
  const { id } = req.params;
  if (!id) return next(createError(400, 'No attendance ID provided'));
  try {
    await removeAllStudentAttendance(id);
    await removeAttendanceFromDb(id);
    return createSuccess(res, 200, 'Attendance deleted successfully', { deleted: true });
  } catch (err) {
    return next(err);
  }
};
