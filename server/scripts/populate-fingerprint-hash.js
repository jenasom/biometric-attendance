/*
  Run this script from the server folder to compute SHA-256 hashes for existing
  student fingerprint BLOBs and populate the `fingerprint_hash` column.
  Usage (PowerShell):
    cd server
    node .\scripts\populate-fingerprint-hash.js
*/

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

(async () => {
  const prisma = new PrismaClient();
  try {
    const students = await prisma.student.findMany({
      where: { fingerprint: { not: null } },
      select: { id: true, fingerprint: true, fingerprint_hash: true },
    });

    console.log(`Found ${students.length} students with fingerprint blobs.`);

    let updated = 0;
    for (const s of students) {
      if (s.fingerprint_hash) continue; // already set
      const buf = Buffer.from(s.fingerprint);
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      await prisma.student.update({ where: { id: s.id }, data: { fingerprint_hash: hash } });
      updated++;
    }

    console.log(`Updated ${updated} student rows with fingerprint_hash.`);
  } catch (err) {
    console.error('Error populating fingerprint hashes:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
