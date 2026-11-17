-- DropIndex
DROP INDEX "Document_type_sdOrderId_key";

-- CreateIndex
CREATE INDEX "Document_type_sdOrderId_idx" ON "Document"("type", "sdOrderId");

-- One ACTIVE document per (type, order); annulled ones may repeat (re-issue after annul).
CREATE UNIQUE INDEX "Document_active_type_order" ON "Document"("type", "sdOrderId") WHERE "status" = 'ACTIVE';
