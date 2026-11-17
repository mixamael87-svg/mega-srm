import { requireUser } from '@/auth/session';
import { HttpError, jsonResponse, route } from '@/http/errors';
import { intParam, pdfResponse } from '@/http/params';
import { labelService } from '@/services';
import { renderLabelsPdf } from '@/labels/renderLabelsPdf';

/** GET ?set=<id>&format=json|pdf — labels of an active nakladna from one label set. */
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const p = new URL(req.url).searchParams;
  const setId = intParam(p.get('set') ?? '', 'Оберіть набір наклейок');
  const { setName, docNumber, plan } = await labelService().planForDocument(intParam((await ctx.params).id), setId);
  if (p.get('format') !== 'pdf') {
    return jsonResponse({ setName, printedCount: plan.printedCount, missing: plan.missing, noPrint: plan.noPrint });
  }
  if (plan.printedCount === 0) throw new HttpError(409, 'Немає наклейок для друку', 'NOTHING_TO_PRINT');
  return pdfResponse(await renderLabelsPdf(plan.pages), `Наклейки_${docNumber}_${setName}.pdf`);
});
