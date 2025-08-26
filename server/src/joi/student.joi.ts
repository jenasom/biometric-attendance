import Joi from 'joi';
import type { Student } from '@prisma/client';

export const createStudentSchema = Joi.object<Omit<Student, 'id' | 'created_at'> & { courses: string[] }>({
  staff_id: Joi.string().min(3).max(128).required(),
  name: Joi.string().min(2).max(128).required(),
  matric_no: Joi.string().min(3).max(128).required(),
  email: Joi.string().email().required(),
  fingerprint: Joi.string().min(2).required(), // removed max length restriction for fingerprint data
  courses: Joi.array().items(Joi.string().min(3).max(128)).required(),
});

export const updateStudentSchema = Joi.object<Partial<Student> & { courses: string[] }>({
  id: Joi.string().min(3).max(128).required(),
  staff_id: Joi.string().min(3).max(128),
  name: Joi.string().min(2).max(128),
  matric_no: Joi.string().min(3).max(128),
  email: Joi.string().email(),
  fingerprint: Joi.string().min(2), // removed max length restriction for fingerprint data
  courses: Joi.array().items(Joi.string().min(3).max(128)),
});
