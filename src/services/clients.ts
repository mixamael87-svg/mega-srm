import { Prisma, type PrismaClient } from '@prisma/client';
import { HttpError } from '../http/errors';

export type ClientFopRow = { id: number; name: string; requisites: string; archived: boolean };
export type ClientWithFops = { id: number; name: string; phone: string; comment: string; fops: ClientFopRow[] };
export type RecipientOption = { id: number; clientId: number; clientName: string; fopName: string; requisites: string };

const fopSelect = { id: true, name: true, requisites: true, archived: true } as const;

/** Trimmed non-empty string or 400 with a Ukrainian message. */
function required(v: string | undefined, message: string): string {
  const s = (v ?? '').trim();
  if (!s) throw new HttpError(400, message);
  return s;
}
const optional = (v: string | undefined) => (v === undefined ? undefined : v.trim());

function notFound(e: unknown, message: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2025' || e.code === 'P2003')) throw new HttpError(404, message);
  throw e;
}

export function createClientService(prisma: PrismaClient) {
  const NAME = 'Вкажіть назву клієнта';
  const FOP_NAME = 'Вкажіть назву ФОП';
  const REQ = 'Вкажіть реквізити ФОП';

  return {
    /** Clients sorted by name; search (case-insensitive) in client name/phone and FOP name/requisites (so ІПН/IBAN too). */
    async listClients(opts: { q?: string; includeArchived?: boolean } = {}): Promise<ClientWithFops[]> {
      const q = opts.q?.trim();
      const contains = (s: string) => ({ contains: s, mode: 'insensitive' as const });
      const fopWhere = opts.includeArchived ? {} : { archived: false };
      return prisma.client.findMany({
        where: q ? { OR: [{ name: contains(q) }, { phone: contains(q) }, { fops: { some: { OR: [{ name: contains(q) }, { requisites: contains(q) }] } } }] } : undefined,
        select: { id: true, name: true, phone: true, comment: true, fops: { where: fopWhere, select: fopSelect, orderBy: { id: 'asc' } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 500,
      });
    },

    async createClient(d: { name: string; phone?: string; comment?: string; fop?: { name: string; requisites: string } }): Promise<ClientWithFops> {
      const name = required(d.name, NAME);
      const fop = d.fop ? { name: required(d.fop.name, FOP_NAME), requisites: required(d.fop.requisites, REQ) } : undefined;
      return prisma.client.create({
        data: { name, phone: optional(d.phone) ?? '', comment: optional(d.comment) ?? '', ...(fop ? { fops: { create: fop } } : {}) },
        select: { id: true, name: true, phone: true, comment: true, fops: { select: fopSelect } },
      });
    },

    async updateClient(id: number, d: { name?: string; phone?: string; comment?: string }) {
      const data = { name: d.name === undefined ? undefined : required(d.name, NAME), phone: optional(d.phone), comment: optional(d.comment) };
      return prisma.client.update({ where: { id }, data, select: { id: true, name: true, phone: true, comment: true } }).catch(e => notFound(e, 'Клієнта не знайдено'));
    },

    async addFop(clientId: number, d: { name: string; requisites: string }): Promise<ClientFopRow> {
      const data = { clientId, name: required(d.name, FOP_NAME), requisites: required(d.requisites, REQ) };
      return prisma.clientFop.create({ data, select: fopSelect }).catch(e => notFound(e, 'Клієнта не знайдено'));
    },

    async updateFop(id: number, d: { name?: string; requisites?: string; archived?: boolean }): Promise<ClientFopRow> {
      const data = {
        name: d.name === undefined ? undefined : required(d.name, FOP_NAME),
        requisites: d.requisites === undefined ? undefined : required(d.requisites, REQ),
        archived: d.archived,
      };
      return prisma.clientFop.update({ where: { id }, data, select: fopSelect }).catch(e => notFound(e, 'ФОП не знайдено'));
    },

    /** Numbers for the delete warning: FOPs of the client and documents issued to them. */
    async usage(clientId: number): Promise<{ fops: number; documents: number }> {
      const c = await prisma.client.findUnique({ where: { id: clientId }, select: { _count: { select: { fops: true } } } });
      if (!c) throw new HttpError(404, 'Клієнта не знайдено');
      const documents = await prisma.document.count({ where: { clientFop: { clientId } } });
      return { fops: c._count.fops, documents };
    },

    async fopUsage(id: number): Promise<{ documents: number }> {
      const f = await prisma.clientFop.findUnique({ where: { id }, select: { _count: { select: { documents: true } } } });
      if (!f) throw new HttpError(404, 'ФОП не знайдено');
      return { documents: f._count.documents };
    },

    /** Delete for good (admin): FOPs and remembered defaults go with it; documents keep their header snapshot. */
    async deleteClient(id: number): Promise<void> {
      await prisma.client.delete({ where: { id } }).catch(e => notFound(e, 'Клієнта не знайдено'));
    },

    async deleteFop(id: number): Promise<void> {
      await prisma.clientFop.delete({ where: { id } }).catch(e => notFound(e, 'ФОП не знайдено'));
    },

    /** Active (not archived) FOPs for the recipient picker, sorted by client then FOP. */
    async recipientOptions(): Promise<RecipientOption[]> {
      const fops = await prisma.clientFop.findMany({
        where: { archived: false },
        include: { client: { select: { name: true } } },
        orderBy: [{ client: { name: 'asc' } }, { id: 'asc' }],
      });
      return fops.map(f => ({ id: f.id, clientId: f.clientId, clientName: f.client.name, fopName: f.name, requisites: f.requisites }));
    },
  };
}

export type ClientService = ReturnType<typeof createClientService>;
