-- «Клієнти»: every existing recipient FOP (module 1, keyed by SalesDrive contact) becomes a client
-- with that one FOP; its contact becomes the remembered default. Documents keep their clientFopId.

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacyFopId" INTEGER,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactDefault" (
    "sdContactId" INTEGER NOT NULL,
    "clientFopId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactDefault_pkey" PRIMARY KEY ("sdContactId")
);

-- AlterTable (nullable first, filled below)
ALTER TABLE "ClientFop" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "clientId" INTEGER;

-- Data: one client per legacy FOP
INSERT INTO "Client" ("name", "legacyFopId") SELECT "name", "id" FROM "ClientFop" ORDER BY "id";

UPDATE "ClientFop" f SET "clientId" = c."id" FROM "Client" c WHERE c."legacyFopId" = f."id";

INSERT INTO "ContactDefault" ("sdContactId", "clientFopId", "updatedAt") SELECT "sdContactId", "id", CURRENT_TIMESTAMP FROM "ClientFop";

ALTER TABLE "Client" DROP COLUMN "legacyFopId";

ALTER TABLE "ClientFop" ALTER COLUMN "clientId" SET NOT NULL;

-- DropIndex / DropColumn
DROP INDEX "ClientFop_sdContactId_key";

ALTER TABLE "ClientFop" DROP COLUMN "sdContactId";

-- CreateIndex
CREATE INDEX "ClientFop_clientId_idx" ON "ClientFop"("clientId");

-- AddForeignKey
ALTER TABLE "ClientFop" ADD CONSTRAINT "ClientFop_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDefault" ADD CONSTRAINT "ContactDefault_clientFopId_fkey" FOREIGN KEY ("clientFopId") REFERENCES "ClientFop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
