import { requireUser } from '@/auth/session';
import { route } from '@/http/errors';
import { intParam, pdfResponse } from '@/http/params';
import { labelService } from '@/services';
import { toContent } from '@/services/labels';
import { renderLabelsPdf } from '@/labels/renderLabelsPdf';

/** One-page PDF of a saved label (shown in the editor). */
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const l = await labelService().getLabel(intParam((await ctx.params).id));
  return pdfResponse(await renderLabelsPdf([toContent(l)]), `Наклейка_${l.sku ?? l.id}.pdf`);
});
