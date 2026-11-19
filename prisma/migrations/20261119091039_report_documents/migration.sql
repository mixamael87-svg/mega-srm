-- CreateEnum
CREATE TYPE "ReportDocKind" AS ENUM ('POVERNENNYA', 'PEREOTSINKA');

-- CreateTable
CREATE TABLE "ReportDocument" (
    "id" SERIAL NOT NULL,
    "kind" "ReportDocKind" NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "clientId" INTEGER,
    "counterFopId" INTEGER,
    "status" "DocStatus" NOT NULL DEFAULT 'ACTIVE',
    "headerJson" JSONB NOT NULL,
    "linesJson" JSONB NOT NULL,
    "totalsJson" JSONB NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCounter" (
    "kind" "ReportDocKind" NOT NULL,
    "fopId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "ReportCounter_pkey" PRIMARY KEY ("kind","fopId","year","month")
);

-- CreateIndex
CREATE INDEX "ReportDocument_kind_counterFopId_date_idx" ON "ReportDocument"("kind", "counterFopId", "date");

-- AddForeignKey
ALTER TABLE "ReportDocument" ADD CONSTRAINT "ReportDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDocument" ADD CONSTRAINT "ReportDocument_counterFopId_fkey" FOREIGN KEY ("counterFopId") REFERENCES "OurFop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDocument" ADD CONSTRAINT "ReportDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCounter" ADD CONSTRAINT "ReportCounter_fopId_fkey" FOREIGN KEY ("fopId") REFERENCES "OurFop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
