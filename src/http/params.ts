import { HttpError } from './errors';

export function intParam(raw: string, message = 'Невірний номер'): number {
  const s = raw.trim();
  if (!/^\d{1,9}$/.test(s) || Number(s) <= 0) throw new HttpError(400, message);
  return Number(s);
}

const UA: Record<string, string> = { а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ie',ж:'zh',з:'z',и:'y',і:'i',ї:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'iu',я:'ia' };
/** ASCII fallback for old clients: "Рахунок-фактура_14_…" → "Rakhunok-faktura_14_…". */
export function asciiFilename(name: string): string {
  return [...name].map(ch => {
    const lo = ch.toLowerCase(); const t = UA[lo];
    if (t === undefined) return /[\x20-\x7e]/.test(ch) && ch !== '"' ? ch : '_';
    return ch !== lo && t ? t[0]!.toUpperCase() + t.slice(1) : t;
  }).join('');
}

export const xlsxResponse = (file: Buffer, filename: string) =>
  new Response(new Uint8Array(file), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'x-filename': encodeURIComponent(filename),
    },
  });
