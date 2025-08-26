import type { StaffInfo, Tokens } from '../interfaces/store.interface';
import { AxiosError } from 'axios';

export interface PaginationMeta {
  per_page: number;
  page: number;
  total_pages: number;
  total_items: number;
}

/* STAFF */
export interface RegisterStaffInput {
  name: string;
  email: string;
  password: string;
  retype_password: string;
}

export interface BaseResult<TData> {
  message: string;
  status: 'sucess';
  statusCode: number;
  data: TData;
}

export type BaseError = AxiosError<{
  message: string;
  status: string;
  statusCode: number;
}>;

export type RegisterStaffResult = BaseResult<{
  staff: Tokens & {
    staff: StaffInfo;
  };
}>;

export interface LoginStaffInput {
  email: string;
  password: string;
}

export type LoginStaffResult = RegisterStaffResult;

/* COURSE */

export interface Course {
  id: string;
  staff_id: string;
  course_name: string;
  course_code: string;
  created_at: string;
}

export interface AddCourseInput {
  staff_id: string;
  course_name: string;
  course_code: string;
}

export type AddCourseResult = BaseResult<{
  course: Course;
}>;

export type GetCoursesResult = BaseResult<{
  courses: Course[];
  meta: PaginationMeta;
}>;

export type DeleteCourseResult = BaseResult<{
  deleted: boolean;
}>;

export interface UpdateCourseInput {
  id: string;
  staff_id: string;
  course_name: string;
  course_code: string;
  url: string;
}

export type UpdateCourseResult = BaseResult<{
  course: Course;
}>;

/* STUDENT */
export interface Student {
  id: string;
  staff_id: string;
  name: string;
  matric_no: string;
  email: string;
  fingerprint: string;
  courses: Course[];
  created_at: string;
}

export interface AddStudentInput {
  staff_id: string;
  name: string;
  matric_no: string;
  email: string;
  fingerprint: string;
  courses: string[];
}

export type AddStudentResult = BaseResult<{
  student: Student;
}>;

export type GetStudentsResult = BaseResult<{
  students: Student[];
  meta: PaginationMeta;
}>;

export type DeleteStudentResult = BaseResult<{
  deleted: boolean;
}>;

export type UpdateStudentInput = AddStudentInput & { id: string; url: string };

export type UpdateStudentResult = BaseResult<{
  student: Student;
}>;

/* ATTENDANCE */

export interface Attendance {
  id: string;
  staff_id: string;
  course_id: string;
  name: string;
  date: string;
  course: Omit<Course, 'created_at' | 'staff_id'>;
  created_at: string;
}

export interface AddAttendanceInput {
  staff_id: string;
  course_id: string;
  name: string;
  date: string;
}

export type AddAttendanceResult = BaseResult<{
  attendance: Attendance;
}>;

export type GetAttendancesResult = BaseResult<{
  attendances: Attendance[];
  meta: PaginationMeta;
}>;

export type DeleteAttendanceResult = BaseResult<{
  deleted: boolean;
}>;

export type UpdateAttendanceInput = AddAttendanceInput & { id: string; url: string };

export type UpdateAttendanceResult = BaseResult<{
  attendance: Attendance;
}>;

export interface MarkAttendanceInput {
  attendance_id: string;
  student_id: string;
}

export type MarkAttendanceResult = BaseResult<{
  marked: boolean;
}>;

export type GetAttendanceListResult = BaseResult<{
  attendanceList: Array<{
    student_id: string;
    attendance_id: string;
    student: Student;
  }>;
}>;
