/*
  Warnings:

  - Added the required column `direction` to the `stock_movements` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "direction" INTEGER NOT NULL;

-- الاتجاه +1 أو -1 فقط (القيد مكرر في prisma/sql/constraints.sql للتوثيق)
ALTER TABLE "stock_movements" ADD CONSTRAINT stock_movement_direction CHECK (direction IN (-1, 1));
