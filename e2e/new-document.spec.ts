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

  // recipient has no requisites yet → buttons blocked, form shown
  await expect(page.getByRole('button', { name: 'Видаткова накладна (.xlsx)' })).toBeDisabled();
  await page.getByLabel(/^Назва/).fill('ФОП Демо Клієнт');
  await page.getByLabel(/^Реквізити/).fill('Юр. адреса: м. Полтава\nІПН 1111111111');
  await page.getByRole('button', { name: 'Зберегти реквізити' }).click();
  await expect(page.getByText('ФОП Демо Клієнт')).toBeVisible();

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

  await page.getByRole('link', { name: 'Історія' }).click();
  await expect(page.getByRole('cell', { name: 'ФОП Демо Клієнт' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '54969' }).first()).toBeVisible();
});
