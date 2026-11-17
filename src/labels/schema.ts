import { z } from 'zod';

export const LabelBody = z.object({
  sku: z.string().nullish(),
  title: z.string().optional(),
  text: z.string().optional(),
  align: z.enum(['center', 'left']).optional(),
  showMark: z.boolean().optional(),
  barcode: z.string().nullish(),
  noPrint: z.boolean().optional(),
  extraLabelId: z.number().int().positive().nullish(),
});
export const ImportBody = z.array(LabelBody.extend({ extraTitle: z.string().optional() })).max(2000);
