import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('client report: turnover → stock → map unknown code → povernennya → new prices → revaluation nakladna → history', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Логін').fill('admin');
  await page.getByLabel('Пароль').fill('adminpass1');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Новий документ' })).toBeVisible();
  const c = await page.request.post('/api/clients', { data: { name: 'Demo Kids', fop: { name: 'ФОП Демо Кідс', requisites: 'ІПН 5555555555' } } });
  expect(c.status()).toBe(201);

  await page.getByRole('link', { name: 'Звіти клієнтів' }).click();
  await page.getByLabel('Клієнт').selectOption({ label: 'Demo Kids' });
  await page.getByLabel('Файл звіту (.xls, .xlsx)').setInputFiles('tests/fixtures/reports/bagel-turnover.xls');
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await expect(page.getByText('«Оборот по постачальникам» 01.10.2026 – 31.10.2026')).toBeVisible();
  await expect(page.getByText('⚠ Не розпізнано (1)')).toBeVisible();

  // drag & drop the stock report onto the drop zone
  const bytes = readFileSync('tests/fixtures/reports/bagel-stock.xls').toString('base64');
  const dt = await page.evaluateHandle(b64 => {
    const d = new DataTransfer();
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    d.items.add(new File([bin], 'Залишок 02.11.2026.xls', { type: 'application/vnd.ms-excel' }));
    return d;
  }, bytes);
  await page.getByTestId('report-drop').dispatchEvent('dragover', { dataTransfer: dt });
  await expect(page.getByTestId('report-drop')).toHaveClass(/drag/);
  await page.getByTestId('report-drop').dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByTestId('report-drop')).toContainText('Залишок 02.11.2026.xls');
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await expect(page.getByText('«Залишок товару по постачальникам» 01.11.2026 – 02.11.2026')).toBeVisible();
  await page.getByLabel('Наш артикул для 90001').fill('0726');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText(/Не розпізнано/)).toHaveCount(0);

  // povernennya at old prices; number suggested from our FOP's counter
  await expect(page.locator('#povernennya-n')).toHaveValue('1');
  const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Накладна на повернення (.xlsx)' }).click()]);
  expect(d1.suggestedFilename()).toMatch(/^Накладна_на_повернення_1_\d{4}-\d{2}-\d{2}\.xlsx$/);

  // revaluation needs every new price
  await expect(page.getByText(/Вкажіть нову ціну для всіх рядків/)).toBeVisible();
  await page.getByRole('button', { name: 'Заповнити старою ціною' }).click();
  await page.getByLabel('Нова ціна 0909').fill('95,00');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Видаткова накладна (переоцінка) (.xlsx)' }).click()]);
  expect(d2.suggestedFilename()).toMatch(/^Видаткова_накладна_переоцінка_1_/);

  await page.getByRole('link', { name: 'Історія' }).click();
  await expect(page.getByRole('heading', { name: 'Документи переоцінки' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Повернення' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Накладна (переоцінка)' })).toBeVisible();
});
