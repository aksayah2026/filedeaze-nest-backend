-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "pincode" TEXT;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "gstNumber" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "ticketNumber" TEXT;
