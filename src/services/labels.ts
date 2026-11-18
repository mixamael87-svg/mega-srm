import { Prisma, type PrismaClient, type Label } from '@prisma/client';
import { HttpError } from '../http/errors';
import { ean13FromSku, isValidEan13 } from '../domain/barcode';
import { labelRows, pagesForItems, type LabelContent, type LabelRecord, type LabelRow } from '../domain/labels';
import type { DocLine } from '../domain/types';
import { labelFits } from '../labels/renderLabelsPdf';

export type LabelInput = {
  sku?: string | null;
  title?: string;
  text?: string;
  align?: 'center' | 'left';
  showMark?: boolean;
  /** undefined/null → from the sku ('' when no sku); '' → no barcode; otherwise a valid EAN-13 */
  barcode?: string | null;
  noPrint?: boolean;
  extraLabelId?: number | null;
};
export type ImportItem = LabelInput & { extraTitle?: string };
export type LabelSetRow = { id: number; name: string; sort: number; count: number };

const SET_NAMES = ['Вкажіть назву набору', 'Набір з такою назвою вже є'] as const;

function notFound(e: unknown, message: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2025' || e.code === 'P2003')) throw new HttpError(404, message);
  throw e;
}
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

function normSku(sku: string | null | undefined): string | null {
  const s = (sku ?? '').trim();
  if (!s) return null;
  if (!/^\d{4}$/.test(s)) throw new HttpError(400, 'Артикул — 4 цифри');
  return s;
}
function normBarcode(barcode: string | null | undefined, sku: string | null): string {
  if (barcode === undefined || barcode === null) return sku ? ean13FromSku(sku) : '';
  const b = barcode.trim();
  if (b && !isValidEan13(b)) throw new HttpError(400, 'Невірний штрихкод');
  return b;
}
/** Text is required unless the label carries a barcode (barcode-only labels exist, e.g. 0105). */
function normText(text: string | undefined, barcode: string): string {
  const t = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!t && !barcode) throw new HttpError(400, 'Вкажіть текст наклейки');
  return t;
}
export const toContent = (l: Pick<Label, 'text' | 'align' | 'showMark' | 'barcode'>): LabelContent =>
  ({ text: l.text, align: l.align, showMark: l.showMark, barcode: l.barcode });

export function createLabelService(prisma: PrismaClient) {
  async function getSet(id: number) {
    const s = await prisma.labelSet.findUnique({ where: { id } });
    if (!s) throw new HttpError(404, 'Набір не знайдено');
    return s;
  }
  async function checkExtra(setId: number, extraLabelId: number | null | undefined, selfId?: number) {
    if (extraLabelId === undefined || extraLabelId === null) return;
    if (extraLabelId === selfId) throw new HttpError(400, 'Наклейка не може бути додатковою сама до себе');
    const x = await prisma.label.findUnique({ where: { id: extraLabelId } });
    if (!x || x.setId !== setId) throw new HttpError(400, 'Додаткова наклейка має бути з того ж набору');
  }
  async function activeNakladna(documentId: number) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { type: true, status: true, number: true, versions: { orderBy: { id: 'desc' }, take: 1, select: { linesJson: true } } },
    });
    if (!doc) throw new HttpError(404, 'Документ не знайдено');
    if (doc.type !== 'NAKLADNA' || doc.status !== 'ACTIVE') throw new HttpError(409, 'Наклейки друкуються лише з активної видаткової накладної', 'LABELS_NOT_ALLOWED');
    return { number: doc.number, lines: (doc.versions[0]?.linesJson ?? []) as DocLine[] };
  }
  const dupSku = (sku: string | null) => new HttpError(400, `Наклейка з артикулом ${sku} вже є в цьому наборі`);

  return {
    async listSets(): Promise<LabelSetRow[]> {
      const sets = await prisma.labelSet.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }], include: { _count: { select: { labels: true } } } });
      return sets.map(s => ({ id: s.id, name: s.name, sort: s.sort, count: s._count.labels }));
    },
    async createSet(name: string) {
      const n = name.trim();
      if (!n) throw new HttpError(400, SET_NAMES[0]);
      const sort = ((await prisma.labelSet.aggregate({ _max: { sort: true } }))._max.sort ?? 0) + 1;
      try { return await prisma.labelSet.create({ data: { name: n, sort } }); }
      catch (e) { if (isUnique(e)) throw new HttpError(400, SET_NAMES[1]); throw e; }
    },
    async renameSet(id: number, name: string) {
      const n = name.trim();
      if (!n) throw new HttpError(400, SET_NAMES[0]);
      try { return await prisma.labelSet.update({ where: { id }, data: { name: n } }); }
      catch (e) { if (isUnique(e)) throw new HttpError(400, SET_NAMES[1]); return notFound(e, 'Набір не знайдено'); }
    },
    async deleteSet(id: number) {
      await prisma.labelSet.delete({ where: { id } }).catch(e => notFound(e, 'Набір не знайдено'));
    },

    /** Labels of a set: search in sku/title/text; sorted by sku, helper labels (no sku) last. */
    async listLabels(setId: number, q?: string): Promise<(Label & { fits: boolean })[]> {
      await getSet(setId);
      const s = q?.trim();
      const contains = { contains: s, mode: 'insensitive' as const };
      const rows = await prisma.label.findMany({
        where: { setId, ...(s ? { OR: [{ sku: contains }, { title: contains }, { text: contains }] } : {}) },
        orderBy: [{ sku: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }, { id: 'asc' }],
      });
      return Promise.all(rows.map(async r => ({ ...r, fits: await labelFits(toContent(r)) })));
    },
    async getLabel(id: number) {
      const l = await prisma.label.findUnique({ where: { id } });
      if (!l) throw new HttpError(404, 'Наклейку не знайдено');
      return l;
    },
    async createLabel(setId: number, input: LabelInput) {
      await getSet(setId);
      const sku = normSku(input.sku);
      const barcode = normBarcode(input.barcode, sku);
      const data = {
        setId, sku, title: (input.title ?? '').trim(), text: normText(input.text, barcode),
        align: input.align ?? 'center', showMark: input.showMark ?? false,
        barcode, noPrint: input.noPrint ?? false, extraLabelId: input.extraLabelId ?? null,
      } as const;
      await checkExtra(setId, data.extraLabelId);
      try { return await prisma.label.create({ data }); }
      catch (e) { if (isUnique(e)) throw dupSku(sku); throw e; }
    },
    async updateLabel(id: number, input: LabelInput) {
      const cur = await this.getLabel(id);
      const sku = input.sku === undefined ? cur.sku : normSku(input.sku);
      const data: Prisma.LabelUncheckedUpdateInput = {};
      if (input.sku !== undefined) data.sku = sku;
      if (input.title !== undefined) data.title = input.title.trim();
      const newBarcode = input.barcode !== undefined ? normBarcode(input.barcode, sku) : undefined;
      if (input.align !== undefined) data.align = input.align;
      if (input.showMark !== undefined) data.showMark = input.showMark;
      if (input.noPrint !== undefined) data.noPrint = input.noPrint;
      if (newBarcode !== undefined) data.barcode = newBarcode;
      else if (input.sku !== undefined && cur.barcode === ean13FromSku(cur.sku ?? '')) data.barcode = sku ? ean13FromSku(sku) : '';
      if (input.text !== undefined) data.text = normText(input.text, String(data.barcode ?? cur.barcode));
      if (input.extraLabelId !== undefined) { await checkExtra(cur.setId, input.extraLabelId, id); data.extraLabelId = input.extraLabelId; }
      try { return await prisma.label.update({ where: { id }, data }); }
      catch (e) { if (isUnique(e)) throw dupSku(sku); throw e; }
    },
    async deleteLabel(id: number) {
      await prisma.label.delete({ where: { id } }).catch(e => notFound(e, 'Наклейку не знайдено'));
    },

    /** Upsert by sku (helper labels: by title); `extraTitle` links to a helper label of the same set. */
    async importLabels(setId: number, items: ImportItem[]): Promise<{ created: number; updated: number }> {
      await getSet(setId);
      let created = 0, updated = 0;
      const ordered = [...items].sort((x, y) => Number(!!normSku(x.sku)) - Number(!!normSku(y.sku))); // helpers first
      return prisma.$transaction(async tx => {
        for (const it of ordered) {
          const sku = normSku(it.sku);
          const title = (it.title ?? '').trim();
          if (!sku && !title) throw new HttpError(400, 'Службова наклейка без назви');
          let extraLabelId: number | null = null;
          if (it.extraTitle) {
            const x = await tx.label.findFirst({ where: { setId, sku: null, title: it.extraTitle.trim() } });
            if (!x) throw new HttpError(400, `Немає наклейки «${it.extraTitle}» для ${sku ?? title}`);
            extraLabelId = x.id;
          }
          const barcode = normBarcode(it.barcode, sku);
          const data = {
            title, text: normText(it.text, barcode), align: it.align ?? 'center', showMark: it.showMark ?? false,
            barcode, noPrint: it.noPrint ?? false, extraLabelId,
          } as const;
          const existing = sku ? await tx.label.findFirst({ where: { setId, sku } }) : await tx.label.findFirst({ where: { setId, sku: null, title } });
          if (existing) { await tx.label.update({ where: { id: existing.id }, data }); updated++; }
          else { await tx.label.create({ data: { ...data, setId, sku } }); created++; }
        }
        return { created, updated };
      }, { timeout: 60_000 });
    },

    async recordsForSet(setId: number): Promise<LabelRecord[]> {
      await getSet(setId);
      const rows = await prisma.label.findMany({ where: { setId, sku: { not: null } }, include: { extraLabel: true } });
      return rows.map(r => ({
        id: r.id, sku: r.sku, noPrint: r.noPrint, ...toContent(r),
        extra: r.extraLabel ? { ...toContent(r.extraLabel), noPrint: r.extraLabel.noPrint } : null,
        extraTitle: r.extraLabel ? (r.extraLabel.title || r.extraLabel.sku) : null,
      }));
    },
    getSet,

    /** Editable print list for an ACTIVE nakladna (lines of its latest version). */
    async rowsForDocument(documentId: number, setId: number): Promise<{ setName: string; title: string; rows: LabelRow[] }> {
      const doc = await activeNakladna(documentId);
      const set = await getSet(setId);
      return { setName: set.name, title: `накладна ${doc.number}`, rows: labelRows(doc.lines, await this.recordsForSet(setId)) };
    },
    /** Editable print list for a SalesDrive order (no document needed). */
    async rowsForOrder(orderId: number, lines: { sku: string; name: string; amount: number }[], setId: number) {
      const set = await getSet(setId);
      const rows = labelRows(lines.map(l => ({ sku: l.sku, name: l.name, qty: l.amount })), await this.recordsForSet(setId));
      return { setName: set.name, title: `заявка ${orderId}`, rows };
    },
    /** Pages for an edited list; unknown and noPrint skus are dropped. */
    async pagesFor(setId: number, items: { sku: string; qty: number }[]): Promise<{ setName: string; pages: LabelContent[] }> {
      const set = await getSet(setId);
      return { setName: set.name, pages: pagesForItems(items, await this.recordsForSet(setId)) };
    },

  };
}
