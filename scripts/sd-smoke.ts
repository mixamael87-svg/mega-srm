/**
 * Manual check against the real SalesDrive API.
 *   SALESDRIVE_BASE_URL=https://<account>.salesdrive.me SALESDRIVE_API_KEY=… [SALESDRIVE_YML_URL=…] npx tsx scripts/sd-smoke.ts 54969
 * Expected for 54969: 68 lines, paymentAmount 39628.55, document total matches.
 */
import { createSalesDriveClient } from '../src/salesdrive/client';
import { buildDocumentLines } from '../src/domain/buildDocument';
import { formatMoney } from '../src/domain/format';

const id = Number(process.argv[2]);
const { SALESDRIVE_BASE_URL: baseUrl, SALESDRIVE_API_KEY: apiKey, SALESDRIVE_YML_URL: catalogYmlUrl } = process.env;
if (!baseUrl || !apiKey) throw new Error('Set SALESDRIVE_BASE_URL and SALESDRIVE_API_KEY');
const sd = createSalesDriveClient({ baseUrl, apiKey, catalogYmlUrl });

const order = await sd.getOrder(id);
if (!order) { console.log(`Order ${id} not found (if it exists, filter[id] is not supported — see client.ts)`); process.exit(1); }
console.log(`#${order.id} ${order.orderTime} ${order.contactName}: ${order.lines.length} lines, paymentAmount ${order.paymentAmount}, discountAmount ${order.discountAmount}`);
for (const l of order.lines.filter(l => l.discount || l.percentDiscount)) console.log('  discounted line:', l);
try {
  const { totals } = buildDocumentLines(order, [], {});
  console.log('document totals:', { gross: formatMoney(totals.grossKop), discount: formatMoney(totals.discountKop), net: formatMoney(totals.netKop) });
} catch (e) { console.log('BUILD ERROR:', (e as Error).message); }
const firstSku = order.lines.find(l => /^\d{4}$/.test(l.sku))?.sku;
if (firstSku) console.log(`catalog variants for ${firstSku}:`, await sd.listProductsBySku(firstSku));
console.log('organizations:', await sd.listOrganizations());
