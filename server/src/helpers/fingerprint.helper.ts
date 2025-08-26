import * as crypto from 'crypto';

export function normalizeBase64(input?: string): string {
  if (!input) return '';
  let str = input.trim();
  // Remove data URI prefix if present
  if (str.includes(',')) str = str.split(',')[1];
  // base64url -> base64
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Remove any whitespace/newlines
  str = str.replace(/\s+/g, '');
  // Pad
  while (str.length % 4 !== 0) str += '=';
  return str;
}

export function fingerprintHashFromBase64(base64: string): string {
  const buffer = Buffer.from(base64, 'base64');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function bufferFromBase64(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}
