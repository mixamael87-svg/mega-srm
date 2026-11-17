/** Client-side display helpers (UAH floats from SalesDrive → "39628,55"). */
export const uah = (x: number) => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
export const kop = (k: number) => uah(k / 100);

/** Download through a plain link so the browser takes the filename from Content-Disposition. */
export function downloadUrl(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', '');
  document.body.appendChild(a);
  a.click();
  a.remove();
}
