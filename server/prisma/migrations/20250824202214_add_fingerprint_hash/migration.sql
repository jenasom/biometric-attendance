/*
  Warnings:

  - A unique constraint covering the columns `[fingerprint_hash]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `student` ADD COLUMN `fingerprint_hash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Student_fingerprint_hash_key` ON `Student`(`fingerprint_hash`);
