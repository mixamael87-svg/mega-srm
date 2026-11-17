import { Prisma, type PrismaClient, type DocType } from '@prisma/client';
import { buildDocumentLines } from '../domain/buildDocument';
import type { DocLine, DocTotals, MixSplit, SdProduct } from '../domain/types';
import type { SalesDriveClient } from '../salesdrive/client';
import type { DocHeader } from '../excel/common';
import { renderNakladna } from '../excel/renderNakladna';
import { renderRahunok } from '../excel/renderRahunok';
import { HttpError } from '../http/errors';
import { nextInvoiceNumber } from './numbering';

export type GenerateInput = { type: DocType; sdOrderId: number; fopId: number; recipientFopId?: number; date: Date; splits: MixSplit[]; userId: number };
export type GeneratedFile = { documentId: number; number: number; file: Buffer; filename: string };

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → local calendar date (midnight). Throws on invalid input. */
export function parseDocDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) throw new HttpError(400, 'Невірна дата');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) throw new HttpError(400, 'Невірна дата');
  return date;
}
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Postgres DATE columns are read/written by Prisma as UTC midnight. */
const toDb = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const fromDb = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function filenameFor(type: DocType, number: number, date: Date) {
  return type === 'RAHUNOK' ? `Рахунок-фактура_${number}_${isoDate(date)}.xlsx` : `Видаткова_накладна_${number}_${isoDate(date)}.xlsx`;
}

/** Header block text: name, phone, then requisites (a leading line equal to the name is not repeated). */
export function partyText(name: string, requisites: string, phone = ''): string {
  const rest = requisites.split(/\r?\n/).map(s => s.trimEnd());
  if (rest[0]?.trim() === name.trim()) rest.shift();
  return [name.trim(), phone.trim(), ...rest].filter(s => s !== '').join('\n');
}

const render = (type: DocType, h: DocHeader, lines: DocLine[], t: DocTotals) => (type === 'RAHUNOK' ? renderRahunok : renderNakladna)(h, lines, t);

type HeaderSnapshot = { supplier: string; recipient: string; payer: string };

export function createDocumentService(deps: { prisma: PrismaClient; sd: SalesDriveClient }) {
  const { prisma, sd } = deps;

  async function variantsFor(skus: string[]): Promise<Record<string, SdProduct[]>> {
    const out: Record<string, SdProduct[]> = {};
    for (const sku of new Set(skus)) out[sku] = await sd.listProductsBySku(sku);
    return out;
  }

  async function generateOnce(input: GenerateInput): Promise<GeneratedFile> {
    const order = await sd.getOrder(input.sdOrderId);
    if (!order) throw new HttpError(404, `Замовлення № ${input.sdOrderId} не знайдено в SalesDrive`, 'ORDER_NOT_FOUND');
    if (!input.recipientFopId) throw new HttpError(400, 'Оберіть одержувача', 'RECIPIENT_REQUIRED');
    const client = await prisma.clientFop.findUnique({ where: { id: input.recipientFopId } });
    if (!client) throw new HttpError(404, 'ФОП одержувача не знайдено', 'RECIPIENT_NOT_FOUND');
    if (client.archived) throw new HttpError(409, 'ФОП одержувача в архіві', 'RECIPIENT_ARCHIVED');
    const fop = await prisma.ourFop.findUnique({ where: { id: input.fopId } });
    if (!fop) throw new HttpError(400, 'Оберіть постачальника', 'FOP_NOT_FOUND');

    const splitSkus = input.splits.map(s => order.lines[s.lineIndex]?.sku).filter((s): s is string => !!s);
    const { lines, totals } = buildDocumentLines(order, input.splits, await variantsFor(splitSkus));
    const header: HeaderSnapshot = {
      supplier: partyText(fop.name, fop.requisites, fop.phone),
      recipient: partyText(client.name, client.requisites),
      payer: 'той самий',
    };

    const { doc } = await prisma.$transaction(async tx => {
      // Only an ACTIVE document is regenerated; after «Анулювати» a new one is issued
      // (rahunok: next number of the counter; nakladna: the order id again). Annulled numbers stay taken.
      const existing = await tx.document.findFirst({ where: { type: input.type, sdOrderId: input.sdOrderId, status: 'ACTIVE' } });
      if (existing && input.type === 'RAHUNOK') {
        // The number belongs to the (FOP × month) counter it came from; moving it would duplicate numbers.
        const was = fromDb(existing.date);
        const sameMonth = was.getFullYear() === input.date.getFullYear() && was.getMonth() === input.date.getMonth();
        if (existing.fopId !== fop.id || !sameMonth) {
          throw new HttpError(409, `Рахунок № ${existing.number} вже сформовано від іншого ФОП або за інший місяць. Номер належить лічильнику цього ФОП за цей місяць, тому змінити постачальника чи місяць для виданого рахунку не можна.`, 'RAHUNOK_LOCKED');
        }
      }
      const doc = existing
        ? await tx.document.update({ where: { id: existing.id }, data: { fopId: fop.id, clientFopId: client.id, date: toDb(input.date) } })
        : await tx.document.create({
            data: {
              type: input.type,
              number: input.type === 'NAKLADNA' ? input.sdOrderId : await nextInvoiceNumber(tx, fop.id, input.date),
              date: toDb(input.date), fopId: fop.id, clientFopId: client.id, sdOrderId: input.sdOrderId, createdById: input.userId,
            },
          });
      // remember the recipient for this SalesDrive contact (suggested next time)
      await tx.contactDefault.upsert({
        where: { sdContactId: order.contactId },
        create: { sdContactId: order.contactId, clientFopId: client.id },
        update: { clientFopId: client.id },
      });
      await tx.documentVersion.create({
        data: { documentId: doc.id, linesJson: lines as unknown as Prisma.InputJsonValue, totalsJson: totals, headerJson: header, createdById: input.userId },
      });
      return { doc };
    });

    const file = await render(input.type, { number: doc.number, date: input.date, ...header }, lines, totals);
    return { documentId: doc.id, number: doc.number, file, filename: filenameFor(input.type, doc.number, input.date) };
  }

  return {
    async generateDocument(input: GenerateInput): Promise<GeneratedFile> {
      try {
        return await generateOnce(input);
      } catch (e) {
        // Two managers created the same document at once: the partial unique index rejects the loser,
        // its counter increment rolls back, and the retry regenerates the winner's document.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return generateOnce(input);
        throw e;
      }
    },

    /** Last recipient FOP chosen for a SalesDrive contact, unless it has been archived since. */
    async defaultRecipientFor(sdContactId: number): Promise<number | null> {
      const d = await prisma.contactDefault.findUnique({ where: { sdContactId }, include: { clientFop: true } });
      return d && !d.clientFop.archived ? d.clientFopId : null;
    },

    async downloadDocument(id: number): Promise<{ file: Buffer; filename: string }> {
      const doc = await prisma.document.findUnique({ where: { id }, include: { versions: { orderBy: { id: 'desc' }, take: 1 } } });
      const v = doc?.versions[0];
      if (!doc || !v) throw new HttpError(404, 'Документ не знайдено');
      const date = fromDb(doc.date);
      const h = v.headerJson as HeaderSnapshot;
      const file = await render(doc.type, { number: doc.number, date, ...h }, v.linesJson as DocLine[], v.totalsJson as DocTotals);
      return { file, filename: filenameFor(doc.type, doc.number, date) };
    },

    async annulDocument(id: number, _userId: number): Promise<void> {
      const doc = await prisma.document.findUnique({ where: { id } });
      if (!doc) throw new HttpError(404, 'Документ не знайдено');
      if (doc.status === 'ANNULLED') throw new HttpError(409, `Документ № ${doc.number} вже анульовано`, 'DOCUMENT_ANNULLED');
      await prisma.document.update({ where: { id }, data: { status: 'ANNULLED' } });
    },

    async listDocuments(opts: { take?: number; q?: string } = {}) {
      const q = opts.q?.trim();
      const n = q && /^\d+$/.test(q) ? Number(q) : undefined;
      const docs = await prisma.document.findMany({
        where: q ? { OR: [...(n ? [{ number: n }, { sdOrderId: n }] : []), { clientFop: { name: { contains: q, mode: 'insensitive' as const } } }, { clientFop: { client: { name: { contains: q, mode: 'insensitive' as const } } } }] } : undefined,
        include: { clientFop: { include: { client: true } }, fop: true, createdBy: true, versions: { orderBy: { id: 'desc' }, take: 1, select: { totalsJson: true, headerJson: true, createdAt: true } } },
        orderBy: { updatedAt: 'desc' },
        take: opts.take ?? 200,
      });
      return docs.map(d => ({
        id: d.id, type: d.type, number: d.number, date: isoDate(fromDb(d.date)), sdOrderId: d.sdOrderId, status: d.status,
        clientName: d.clientFop
          ? `${d.clientFop.client.name} — ${d.clientFop.name}`
          : `${((d.versions[0]?.headerJson as HeaderSnapshot | undefined)?.recipient ?? '').split('\n')[0] || 'Одержувач'} (видалено)`, fopName: d.fop.name, createdBy: d.createdBy.login,
        netKop: (d.versions[0]?.totalsJson as DocTotals | undefined)?.netKop ?? 0,
        updatedAt: d.versions[0]?.createdAt ?? d.updatedAt,
      }));
    },
  };
}

export type DocumentService = ReturnType<typeof createDocumentService>;
