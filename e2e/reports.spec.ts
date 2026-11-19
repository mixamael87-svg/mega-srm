import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('client report: stock first → name suggestions confirmed → unknown typed → povernennya → new prices → revaluation → history', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Логін').fill('admin');
  await page.getByLabel('Пароль').fill('adminpass1');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Новий документ' })).toBeVisible();
  expect((await page.request.post('/api/clients', { data: { name: 'Demo Kids', fop: { name: 'ФОП Демо Кідс', requisites: 'ІПН 5555555555' } } })).status()).toBe(201);

  await page.getByRole('link', { name: 'Звіти клієнтів' }).click();
  await page.getByLabel('Клієнт').selectOption({ label: 'Demo Kids' });

  // drag & drop the stock report (no barcodes) onto the drop zone
  const bytes = readFileSync('tests/fixtures/reports/bagel-stock.xls').toString('base64');
  const dt = await page.evaluateHandle(b64 => {
    const d = new DataTransfer();
    d.items.add(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'Залишок 02.11.2026.xls', { type: 'application/vnd.ms-excel' }));
    return d;
  }, bytes);
  await page.getByTestId('report-drop').dispatchEvent('dragover', { dataTransfer: dt });
  await expect(page.getByTestId('report-drop')).toHaveClass(/drag/);
  await page.getByTestId('report-drop').dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByTestId('report-drop')).toContainText('Залишок 02.11.2026.xls');
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await expect(page.getByText('«Залишок товару по постачальникам» 01.11.2026 – 02.11.2026')).toBeVisible();

  // suggestions by name are prefilled; documents wait for confirmation
  await expect(page.getByLabel('Артикул 88514')).toHaveValue('0909');
  await expect(page.getByLabel('Артикул 90001')).toHaveValue('');
  await expect(page.getByText('Підтвердіть або виправте артикули: 4').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Накладна на повернення (.xlsx)' })).toBeDisabled();
  await page.getByRole('button', { name: 'Підтвердити всі 🟡 (3)' }).click();
  await expect(page.getByText('Підтвердіть або виправте артикули: 1').first()).toBeVisible();
  await page.getByLabel('Артикул 90001').fill('0726');
  await page.getByLabel('Артикул 90001').press('Enter');
  await expect(page.getByText(/Підтвердіть або виправте артикули/)).toHaveCount(0);

  // new price starts as the purchase price
  await expect(page.getByLabel('Нова ціна 88514').first()).toHaveValue('87.40');

  await expect(page.locator('#povernennya-n')).toHaveValue('1');
  const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Накладна на повернення (.xlsx)' }).click()]);
  expect(d1.suggestedFilename()).toMatch(/^Накладна_на_повернення_1_\d{4}-\d{2}-\d{2}\.xlsx$/);

  await page.getByLabel('Нова ціна 88514').first().fill('95,00');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Видаткова накладна (переоцінка) (.xlsx)' }).click()]);
  expect(d2.suggestedFilename()).toMatch(/^Видаткова_накладна_переоцінка_1_/);

  // the same report again: everything is exact now
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await expect(page.getByText(/Підтвердіть або виправте артикули/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Історія' }).click();
  await expect(page.getByRole('heading', { name: 'Документи переоцінки' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Повернення' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Накладна (переоцінка)' })).toBeVisible();
});
