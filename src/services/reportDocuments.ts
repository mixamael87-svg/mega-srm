import { Prisma, type PrismaClient, type ReportDocKind } from '@prisma/client';
import { ean13FromSku } from '../domain/barcode';
import type { DocLine, DocTotals } from '../domain/types';
import type { DocHeader } from '../excel/common';
import { renderNakladna } from '../excel/renderNakladna';
import { renderPovernennya } from '../excel/renderPovernennya';
import { HttpError } from '../http/errors';
import { fromDb, isoDate, partyText, toDb } from './documents';

export type Party = { type: 'our' | 'client'; id: number };
export type ReportLineInput = { sku: string; name: string; qty: number; priceKop: number };
export type CreateReportDocInput = {
  kind: ReportDocKind; number: number; date: Date; supplier: Party; recipient: Party; clientId: number;
  lines: ReportLineInput[]; allowDuplicate?: boolean; userId: number;
};
type Header = { supplier: string; recipient: string; payer: string };

const render = (kind: ReportDocKind, h: DocHeader, l: DocLine[], t: DocTotals) => (kind === 'POVERNENNYA' ? renderPovernennya : renderNakladna)(h, l, t);
export const reportFilename = (kind: ReportDocKind, n: number, d: Date) =>
  kind === 'POVERNENNYA' ? `Накладна_на_повернення_${n}_${isoDate(d)}.xlsx` : `Видаткова_накладна_переоцінка_${n}_${isoDate(d)}.xlsx`;
/** Our side numbers the document: the recipient of a return, the supplier of a revaluation nakladna. */
const ourSide = (kind: ReportDocKind, s: Party, r: Party) => { const p = kind === 'POVERNENNYA' ? r : s; return p.type === 'our' ? p.id : null; };
const monthRange = (d: Date) => ({ gte: toDb(new Date(d.getFullYear(), d.getMonth(), 1)), lt: toDb(new Date(d.getFullYear(), d.getMonth() + 1, 1)) });

export function createReportDocumentService(prisma: PrismaClient) {
  async function partyHeader(p: Party, clientId: number): Promise<string> {
    if (p.type === 'our') {
      const f = await prisma.ourFop.findUnique({ where: { id: p.id } });
      if (!f || f.archived) throw new HttpError(400, 'Оберіть нашого ФОП');
      return partyText(f.name, f.requisites, f.phone);
    }
    const f = await prisma.clientFop.findUnique({ where: { id: p.id } });
    if (!f || f.archived || f.clientId !== clientId) throw new HttpError(400, 'Оберіть ФОП цього клієнта');
    return partyText(f.name, f.requisites);
  }

  return {
    /** Suggested number: last of (kind × our FOP × month) + 1. Nothing is reserved. */
    async nextNumber(kind: ReportDocKind, fopId: number, date: Date): Promise<number> {
      const c = await prisma.reportCounter.findUnique({ where: { kind_fopId_year_month: { kind, fopId, year: date.getFullYear(), month: date.getMonth() + 1 } } });
      return (c?.last ?? 0) + 1;
    },

    async create(input: CreateReportDocInput): Promise<{ id: number; number: number; file: Buffer; filename: string }> {
      if (!Number.isSafeInteger(input.number) || input.number <= 0) throw new HttpError(400, 'Вкажіть номер документа');
      if (input.lines.length === 0) throw new HttpError(400, 'Немає рядків');
      if (input.lines.some(l => !(l.qty > 0))) throw new HttpError(400, 'Кількість має бути більше 0');
      if (input.lines.some(l => !Number.isSafeInteger(l.priceKop) || l.priceKop <= 0)) {
        throw new HttpError(400, input.kind === 'PEREOTSINKA' ? 'Вкажіть нову ціну для всіх рядків' : 'Ціна має бути більше 0');
      }
      const client = await prisma.client.findUnique({ where: { id: input.clientId } });
      if (!client) throw new HttpError(404, 'Клієнта не знайдено');
      const header: Header = { supplier: await partyHeader(input.supplier, client.id), recipient: await partyHeader(input.recipient, client.id), payer: 'той самий' };
      const counterFopId = ourSide(input.kind, input.supplier, input.recipient);

      const docLines: DocLine[] = input.lines.map((l, i) => ({
        no: i + 1, sku: l.sku, name: l.name, barcode: ean13FromSku(l.sku), qty: l.qty, priceKop: l.priceKop, sumKop: Math.round(l.qty * l.priceKop),
      }));
      const net = docLines.reduce((s, l) => s + l.sumKop, 0);
      const totals: DocTotals = { grossKop: net, discountKop: 0, netKop: net };

      const doc = await prisma.$transaction(async tx => {
        if (counterFopId && !input.allowDuplicate) {
          const dup = await tx.reportDocument.findFirst({ where: { kind: input.kind, counterFopId, number: input.number, status: 'ACTIVE', date: monthRange(input.date) } });
          if (dup) throw new HttpError(409, `Документ № ${input.number} цього виду вже є за цей місяць`, 'DUPLICATE_NUMBER');
        }
        if (counterFopId) {
          const key = { kind: input.kind, fopId: counterFopId, year: input.date.getFullYear(), month: input.date.getMonth() + 1 };
          await tx.$executeRaw`
            INSERT INTO "ReportCounter" ("kind", "fopId", "year", "month", "last")
            VALUES (${key.kind}::"ReportDocKind", ${key.fopId}, ${key.year}, ${key.month}, ${input.number})
            ON CONFLICT ("kind", "fopId", "year", "month") DO UPDATE SET "last" = GREATEST("ReportCounter"."last", EXCLUDED."last")`;
        }
        return tx.reportDocument.create({
          data: {
            kind: input.kind, number: input.number, date: toDb(input.date), clientId: client.id, counterFopId, createdById: input.userId,
            headerJson: header, linesJson: docLines as unknown as Prisma.InputJsonValue, totalsJson: totals,
          },
        });
      });
      const file = await render(input.kind, { number: doc.number, date: input.date, ...header }, docLines, totals);
      return { id: doc.id, number: doc.number, file, filename: reportFilename(input.kind, doc.number, input.date) };
    },

    async list(opts: { take?: number } = {}) {
      const docs = await prisma.reportDocument.findMany({ include: { client: true, createdBy: true }, orderBy: { id: 'desc' }, take: opts.take ?? 200 });
      return docs.map(d => ({
        id: d.id, kind: d.kind, number: d.number, date: isoDate(fromDb(d.date)), status: d.status,
        clientName: d.client?.name ?? `${((d.headerJson as Header).recipient ?? '').split('\n')[0]} (видалено)`,
        netKop: (d.totalsJson as DocTotals).netKop, createdBy: d.createdBy.login, createdAt: d.createdAt,
      }));
    },

    async download(id: number): Promise<{ file: Buffer; filename: string }> {
      const d = await prisma.reportDocument.findUnique({ where: { id } });
      if (!d) throw new HttpError(404, 'Документ не знайдено');
      const date = fromDb(d.date);
      const file = await render(d.kind, { number: d.number, date, ...(d.headerJson as Header) }, d.linesJson as DocLine[], d.totalsJson as DocTotals);
      return { file, filename: reportFilename(d.kind, d.number, date) };
    },

    async annul(id: number): Promise<void> {
      const d = await prisma.reportDocument.findUnique({ where: { id } });
      if (!d) throw new HttpError(404, 'Документ не знайдено');
      if (d.status === 'ANNULLED') throw new HttpError(409, `Документ № ${d.number} вже анульовано`, 'DOCUMENT_ANNULLED');
      await prisma.reportDocument.update({ where: { id }, data: { status: 'ANNULLED' } });
    },
  };
}
