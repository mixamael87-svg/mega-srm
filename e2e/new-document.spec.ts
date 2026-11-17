import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

test('login → order 54969 → split Ніблер (Мікс) 6/6/6/6 → nakladna with 71 product rows', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Логін').fill('admin');
  await page.getByLabel('Пароль').fill('adminpass1');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Новий документ' })).toBeVisible();

  await page.getByLabel('№ замовлення SalesDrive').fill('abc');
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await expect(page.locator('div.card.error')).toHaveText('Введіть номер замовлення');

  await page.getByLabel('№ замовлення SalesDrive').fill('123');
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await expect(page.locator('div.card.error')).toHaveText('Замовлення № 123 не знайдено в SalesDrive');

  await page.getByLabel('№ замовлення SalesDrive').fill('54969');
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await expect(page.getByText('Замовлення № 54969')).toBeVisible();

  // no recipient chosen yet → buttons blocked; add a new client right from the document screen
  await expect(page.getByRole('button', { name: 'Видаткова накладна (.xlsx)' })).toBeDisabled();
  await expect(page.getByText('Оберіть одержувача')).toBeVisible();
  await page.getByRole('button', { name: '+ Новий клієнт / ФОП' }).click();
  await page.getByLabel('Назва нового клієнта').fill('Демо');
  await page.getByLabel('Назва ФОП').fill('ФОП Демо Клієнт');
  await page.getByLabel(/^Реквізити ФОП/).fill('Юр. адреса: м. Полтава\nІПН 1111111111');
  await page.getByRole('button', { name: 'Зберегти і обрати' }).click();
  await expect(page.getByText('ІПН 1111111111')).toBeVisible();

  await page.getByRole('button', { name: 'Розбити по кольорах' }).click();
  for (const c of ['рожевий', 'блакитний', 'зелений']) await page.getByLabel(`К-ть Ніблер (${c})`).fill('6');
  await page.getByLabel('К-ть Ніблер (бузковий)').fill('5');
  await expect(page.getByText('Розбито 23 з 24')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Видаткова накладна (.xlsx)' })).toBeDisabled();
  await page.getByLabel('К-ть Ніблер (бузковий)').fill('6');
  await expect(page.getByText('Розбито 24 з 24')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Видаткова накладна (.xlsx)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Видаткова_накладна_54969_2026-11-12.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await readFile((await download.path())!)) as any);
  let products = 0;
  wb.worksheets[0]!.eachRow(r => { if (/^\d+$/.test(String(r.getCell(1).text)) && String(r.getCell(2).text) !== '') products++; });
  expect(products).toBe(71);

  // the choice is remembered for this SalesDrive contact
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await expect(page.getByLabel('Одержувач')).toHaveValue('Демо — ФОП Демо Клієнт (ІПН 1111111111)');

  await page.getByRole('link', { name: 'Історія' }).click();
  await expect(page.getByRole('cell', { name: 'Демо — ФОП Демо Клієнт' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '54969' }).first()).toBeVisible();

  // labels from the nakladna: one label for sku 0102 (qty 3 in the demo order), the rest are reported as missing
  const sets = await (await page.request.get('/api/label-sets')).json();
  const zag = sets.find((x: { name: string }) => x.name === 'Загальна');
  const created = await page.request.post(`/api/label-sets/${zag.id}/labels`, { data: { sku: '0102', text: 'Товар демо\nАрт. 0102' } });
  expect(`${created.status()} ${await created.text()}`).toMatch(/^201 /);
  await page.reload();
  const nakladna = page.getByRole('row').filter({ hasText: 'Накладна' }).first();
  await expect(nakladna.getByRole('button', { name: 'Наклейки: Загальна' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Рахунок' }).getByRole('button', { name: /^Наклейки:/ })).toHaveCount(0);
  await nakladna.getByRole('button', { name: 'Наклейки: Загальна' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Буде надруковано 3 наклейки');
  await expect(dlg).toContainText('Немає наклейки');
  await expect(dlg.getByRole('cell', { name: '0103', exact: true })).toBeVisible();
  const [pdf] = await Promise.all([
    page.context().waitForEvent('response', r => /\/api\/documents\/\d+\/labels\?set=\d+&format=pdf$/.test(r.url())),
    dlg.getByRole('button', { name: 'Друкувати' }).click(),
  ]);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  await dlg.getByRole('button', { name: 'Закрити' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
