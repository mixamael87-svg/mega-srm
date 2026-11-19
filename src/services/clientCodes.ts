import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../http/errors';

export function createClientCodeService(prisma: PrismaClient) {
  return {
    async load(clientId: number): Promise<Map<string, string>> {
      const rows = await prisma.clientCode.findMany({ where: { clientId } });
      return new Map(rows.map(r => [r.code, r.sku]));
    },

    /** Remember code → SKU learned from barcodes; manual mappings are never overwritten. */
    async learn(clientId: number, learned: Map<string, string>): Promise<void> {
      if (learned.size === 0) return;
      const manual = new Set((await prisma.clientCode.findMany({ where: { clientId, source: 'manual' }, select: { code: true } })).map(r => r.code));
      await prisma.$transaction(
        [...learned].filter(([code]) => !manual.has(code)).map(([code, sku]) =>
          prisma.clientCode.upsert({ where: { clientId_code: { clientId, code } }, create: { clientId, code, sku, source: 'barcode' }, update: { sku, source: 'barcode' } })),
      );
    },

    async setManual(clientId: number, code: string, sku: string): Promise<void> {
      const c = code.trim(), s = sku.trim();
      if (!c) throw new HttpError(400, 'Немає коду клієнта');
      if (!/^\d{4}$/.test(s)) throw new HttpError(400, 'Артикул — 4 цифри');
      await prisma.clientCode.upsert({ where: { clientId_code: { clientId, code: c } }, create: { clientId, code: c, sku: s, source: 'manual' }, update: { sku: s, source: 'manual' } });
    },

    async remove(clientId: number, code: string): Promise<void> {
      await prisma.clientCode.deleteMany({ where: { clientId, code } });
    },
  };
}
