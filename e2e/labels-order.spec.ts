import { test, expect } from '@playwright/test';

test('labels straight from a SalesDrive order: edit the list, add an article, print', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Логін').fill('admin');
  await page.getByLabel('Пароль').fill('adminpass1');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Новий документ' })).toBeVisible();

  // a label for 0104 (qty 5 in the demo order) and one for 0300 (not in the order)
  const sets = await (await page.request.get('/api/label-sets')).json();
  const zag = sets.find((x: { name: string }) => x.name === 'ТОВ Кузкас');
  for (const sku of ['0104', '0300']) {
    const r = await page.request.post(`/api/label-sets/${zag.id}/labels`, { data: { sku, text: `Товар\nАрт. ${sku}` } });
    expect([201, 400]).toContain(r.status()); // 400 = already there from a rerun
  }

  await page.getByLabel('№ замовлення SalesDrive').fill('54969');
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await page.getByRole('button', { name: 'Друкувати: ТОВ Кузкас' }).click();

  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('заявка 54969');
  const row0104 = dlg.getByRole('row').filter({ hasText: '0104' });
  await expect(row0104).toContainText('є наклейка');
  await dlg.getByText(/^Не друкуються/).click();
  await expect(dlg.getByRole('row').filter({ hasText: '0105' })).toContainText('немає наклейки');
  await expect(dlg).toContainText('Буде надруковано 5 наклейок');

  await row0104.getByLabel('К-ть 0104').fill('2');
  await expect(dlg).toContainText('Буде надруковано 2 наклейки');

  await dlg.getByLabel('Артикул').fill('0300');
  await dlg.getByLabel('Кількість').fill('3');
  await dlg.getByRole('button', { name: '+ Додати' }).click();
  await expect(dlg.getByRole('row').filter({ hasText: '0300' })).toContainText('є наклейка');
  await expect(dlg).toContainText('Буде надруковано 5 наклейок');

  await dlg.getByRole('row').filter({ hasText: '0300' }).getByRole('button', { name: 'Прибрати 0300' }).click();
  await expect(dlg).toContainText('Буде надруковано 2 наклейки');

  const [pdf] = await Promise.all([
    page.waitForResponse(r => /\/api\/label-sets\/\d+\/print$/.test(r.url())),
    dlg.getByRole('button', { name: 'Друкувати' }).click(),
  ]);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect(pdf.request().postDataJSON()).toEqual({ title: 'заявка 54969', items: [{ sku: '0104', qty: 2 }] });
});
