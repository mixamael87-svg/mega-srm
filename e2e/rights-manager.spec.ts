import { test, expect } from '@playwright/test';

test('manager: edits our FOPs, no delete buttons, can annul, no users tab', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Логін').fill('manager');
  await page.getByLabel('Пароль').fill('managerpass1');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Новий документ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Користувачі' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Наші ФОП' }).click();
  await expect(page.getByRole('heading', { name: 'Наші ФОП' })).toBeVisible();
  const add = page.locator('form', { hasText: 'Додати ФОП' });
  await add.locator('input[name="name"]').fill('ФОП Менеджерський');
  await add.getByRole('button', { name: 'Додати' }).click();
  const card = page.locator('form', { has: page.locator('input[value="ФОП Менеджерський"]') });
  await card.locator('input[name="phone"]').fill('099 123 45 67');
  await card.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Збережено')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Видалити' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Клієнти' }).click();
  await expect(page.getByRole('button', { name: 'Видалити', exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Історія' }).click();
  await expect(page.getByRole('button', { name: 'Анулювати' }).first()).toBeVisible();
});
