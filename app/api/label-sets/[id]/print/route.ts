import { z } from 'zod';
import { requireUser } from '@/auth/session';
import { HttpError, route } from '@/http/errors';
import { intParam, pdfResponse } from '@/http/params';
import { labelService } from '@/services';
import { renderLabelsPdf } from '@/labels/renderLabelsPdf';

const Body = z.object({
  title: z.string().max(80).default(''),
  items: z.array(z.object({ sku: z.string().max(20), qty: z.number().int().min(0).max(5000) })).max(1000),
});

/** POST { title, items: [{ sku, qty }] } — PDF of the edited print list (all signed-in users). */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const { title, items } = Body.parse(await req.json());
  const { setName, pages } = await labelService().pagesFor(intParam((await ctx.params).id), items);
  if (pages.length === 0) throw new HttpError(409, 'Немає наклейок для друку', 'NOTHING_TO_PRINT');
  return pdfResponse(await renderLabelsPdf(pages), `Наклейки_${title || setName}_${setName}.pdf`);
});
