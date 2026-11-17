-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'manager');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('RAHUNOK', 'NAKLADNA');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('ACTIVE', 'ANNULLED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'manager',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OurFop" (
    "id" SERIAL NOT NULL,
    "sdOrganizationId" INTEGER,
    "name" TEXT NOT NULL,
    "requisites" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OurFop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFop" (
    "id" SERIAL NOT NULL,
    "sdContactId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "requisites" TEXT NOT NULL,

    CONSTRAINT "ClientFop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "fopId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("fopId","year","month")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "type" "DocType" NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "fopId" INTEGER NOT NULL,
    "clientFopId" INTEGER NOT NULL,
    "sdOrderId" INTEGER NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "linesJson" JSONB NOT NULL,
    "totalsJson" JSONB NOT NULL,
    "headerJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "OurFop_sdOrganizationId_key" ON "OurFop"("sdOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientFop_sdContactId_key" ON "ClientFop"("sdContactId");

-- CreateIndex
CREATE INDEX "Document_date_idx" ON "Document"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Document_type_sdOrderId_key" ON "Document"("type", "sdOrderId");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- AddForeignKey
ALTER TABLE "InvoiceCounter" ADD CONSTRAINT "InvoiceCounter_fopId_fkey" FOREIGN KEY ("fopId") REFERENCES "OurFop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fopId_fkey" FOREIGN KEY ("fopId") REFERENCES "OurFop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientFopId_fkey" FOREIGN KEY ("clientFopId") REFERENCES "ClientFop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
