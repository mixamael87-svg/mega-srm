import { test, expect } from '@playwright/test';

test('admin deletes our FOP without documents after two warnings', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Логін').fill('admin');
  await page.getByLabel('Пароль').fill('adminpass1');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await page.getByRole('link', { name: 'Наші ФОП' }).click();

  const add = page.locator('form', { hasText: 'Додати ФОП' });
  await add.locator('input[name="name"]').fill('ФОП Помилковий');
  await add.getByRole('button', { name: 'Додати' }).click();
  const card = page.locator('form', { has: page.locator('input[value="ФОП Помилковий"]') });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Видалити ФОП «ФОП Помилковий»? Документів по ньому немає — його буде видалено назавжди.');
  let dialogText = '';
  page.once('dialog', d => { dialogText = d.message(); void d.accept(); });
  await page.getByRole('button', { name: 'Так, видалити' }).click();
  await expect(page.getByText('ФОП «ФОП Помилковий» видалено')).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(dialogText).toBe('Остаточно прибрати ФОП «ФОП Помилковий»? Це не можна скасувати.');
});
