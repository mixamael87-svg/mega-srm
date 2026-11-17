-- CreateEnum
CREATE TYPE "LabelAlign" AS ENUM ('center', 'left');

-- CreateTable
CREATE TABLE "LabelSet" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LabelSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Label" (
    "id" SERIAL NOT NULL,
    "setId" INTEGER NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "align" "LabelAlign" NOT NULL DEFAULT 'center',
    "showMark" BOOLEAN NOT NULL DEFAULT false,
    "barcode" TEXT NOT NULL DEFAULT '',
    "noPrint" BOOLEAN NOT NULL DEFAULT false,
    "extraLabelId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabelSet_name_key" ON "LabelSet"("name");

-- CreateIndex
CREATE INDEX "Label_setId_idx" ON "Label"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "Label_setId_sku_key" ON "Label"("setId", "sku");

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LabelSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_extraLabelId_fkey" FOREIGN KEY ("extraLabelId") REFERENCES "Label"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: the three label sets (one print button each)
INSERT INTO "LabelSet" ("name", "sort") VALUES ('Загальна', 1), ('ФОП Кузнецов', 2), ('ТОВ Кузкас', 3) ON CONFLICT ("name") DO NOTHING;
