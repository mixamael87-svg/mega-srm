import { prisma } from '@/db/prisma';
import { requireUser } from '@/auth/session';
import { jsonResponse, route } from '@/http/errors';
import { salesDrive } from '@/salesdrive/fromEnv';

/** Import organizations found in SalesDrive documents as our FOPs (existing ones are left untouched). */
export const POST = route(async (req: Request) => {
  await requireUser(req);
  const orgs = await salesDrive().listOrganizations();
  let created = 0;
  for (const o of orgs) {
    const exists = await prisma.ourFop.findUnique({ where: { sdOrganizationId: o.id } });
    if (exists) continue;
    await prisma.ourFop.create({ data: { sdOrganizationId: o.id, name: o.title, requisites: [o.iban && `IBAN ${o.iban}`, o.egrpou && `ІПН ${o.egrpou}`].filter(Boolean).join('\n') } });
    created++;
  }
  return jsonResponse({ found: orgs.length, created });
});
