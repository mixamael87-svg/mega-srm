-- CreateTable
CREATE TABLE "ClientCode" (
    "clientId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCode_pkey" PRIMARY KEY ("clientId","code")
);

-- AddForeignKey
ALTER TABLE "ClientCode" ADD CONSTRAINT "ClientCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
