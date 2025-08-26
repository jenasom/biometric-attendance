import { Student } from '@prisma/client';

// Omit `email` from the base type so we can re-declare it as optional
export interface StudentDTO extends Omit<Student, 'fingerprint' | 'email'> {
  fingerprint: string; // Base64 string for API communication
  email?: string;
}

export interface StudentCreateInput extends Omit<Student, 'id' | 'created_at' | 'fingerprint' | 'email'> {
  fingerprint: string; // Base64 string from client
  courses: string[];
  email?: string;
}

export interface StudentUpdateInput extends Partial<Omit<Student, 'fingerprint'>> {
  fingerprint?: string; // Optional base64 string from client
  courses?: string[];
  email?: string;
}
