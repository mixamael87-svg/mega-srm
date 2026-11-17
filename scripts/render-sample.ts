/** Render sample documents to ./out for visual review: npx tsx scripts/render-sample.ts */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDocumentLines } from '../src/domain/buildDocument';
import { renderNakladna } from '../src/excel/renderNakladna';
import { renderRahunok } from '../src/excel/renderRahunok';
import type { SdOrder } from '../src/domain/types';

const order: SdOrder = JSON.parse(readFileSync('tests/fixtures/order-55225.json', 'utf8'));
order.lines.push(
  { productId: 1, parameter: 'x1', sku: '0001', name: 'Ніблер (Мікс) (0001)', amount: 24, price: 45, discount: 0, percentDiscount: 0 },
  { productId: 2, parameter: 'x2', sku: '0525', name: 'Пустушка латексна (Зелена) 0+ — дуже довга назва товару, щоб перевірити перенесення рядка', amount: 15, price: 40.5, discount: 0, percentDiscount: 0 },
);
order.paymentAmount = 167 + 24 * 45 + 15 * 40.5;
const { lines, totals } = buildDocumentLines(order, [], {});
const h = {
  number: 54969, date: new Date(2026, 10, 12),
  supplier: 'ФОП Кузнецов Михайло Володимирович\nтел. 067 000 00 00\nЮр. адреса: м. Київ, вул. Тестова, 1\nIBAN UA000000000000000000000000000 в АТ КБ "ПРИВАТБАНК"\nІПН 1234567890',
  recipient: 'ФОП Палій Анна\nЮр. адреса: м. Полтава, вул. Тестова, 2\nIBAN UA111111111111111111111111111 в АТ "Ощадбанк"\nІПН 0987654321',
  payer: 'той самий',
};
mkdirSync('out', { recursive: true });
writeFileSync('out/nakladna.xlsx', await renderNakladna(h, lines, totals));
writeFileSync('out/rahunok.xlsx', await renderRahunok({ ...h, number: 14 }, lines, { ...totals, grossKop: totals.grossKop + 5000, discountKop: 5000 }));
console.log('ok', lines.length, totals);
