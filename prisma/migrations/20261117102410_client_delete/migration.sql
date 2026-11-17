-- DropForeignKey
ALTER TABLE "ClientFop" DROP CONSTRAINT "ClientFop_clientId_fkey";

-- DropForeignKey
ALTER TABLE "ContactDefault" DROP CONSTRAINT "ContactDefault_clientFopId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_clientFopId_fkey";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "clientFopId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ClientFop" ADD CONSTRAINT "ClientFop_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDefault" ADD CONSTRAINT "ContactDefault_clientFopId_fkey" FOREIGN KEY ("clientFopId") REFERENCES "ClientFop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientFopId_fkey" FOREIGN KEY ("clientFopId") REFERENCES "ClientFop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
