import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../http/errors';

/**
 * Our FOPs (suppliers). A FOP with documents is never deleted: its rahunok counter must survive,
 * otherwise re-adding the same FOP would restart numbering and duplicate numbers. Such a FOP is archived instead.
 */
export function createOurFopService(prisma: PrismaClient) {
  async function documents(id: number): Promise<number> {
    const f = await prisma.ourFop.findUnique({ where: { id }, select: { _count: { select: { documents: true, reportDocuments: true } } } });
    if (!f) throw new HttpError(404, 'ФОП не знайдено');
    return f._count.documents + f._count.reportDocuments;
  }

  return {
    async usage(id: number): Promise<{ documents: number }> {
      return { documents: await documents(id) };
    },

    /** No documents → delete for good (with its counters); otherwise archive and drop «основний». */
    async remove(id: number): Promise<{ deleted: boolean; archived: boolean }> {
      if ((await documents(id)) === 0) {
        await prisma.$transaction([prisma.invoiceCounter.deleteMany({ where: { fopId: id } }), prisma.ourFop.delete({ where: { id } })]);
        return { deleted: true, archived: false };
      }
      await prisma.ourFop.update({ where: { id }, data: { archived: true, isDefault: false } });
      return { deleted: false, archived: true };
    },

    async restore(id: number): Promise<void> {
      await documents(id);
      await prisma.ourFop.update({ where: { id }, data: { archived: false } });
    },
  };
}
