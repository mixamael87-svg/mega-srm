import { test, expect } from '@playwright/test';

test('clients tab: client with two FOPs, search by ІПН, archive hides FOP from the document picker', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Логін').fill('admin');
  await page.getByLabel('Пароль').fill('adminpass1');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await page.getByRole('link', { name: 'Клієнти' }).click();
  await expect(page.getByRole('heading', { name: 'Клієнти' })).toBeVisible();

  await page.getByRole('button', { name: '+ Новий клієнт' }).click();
  await page.getByLabel('Назва клієнта', { exact: true }).fill('BabyTop');
  await page.getByLabel('Телефон', { exact: true }).fill('067 111 22 33');
  await page.getByLabel('Перший ФОП (можна додати пізніше)').fill('ФОП Іваненко І.І.');
  await page.getByLabel('Реквізити ФОП', { exact: true }).fill('Юр. адреса: Київ\nІПН 1234567890');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('BabyTop')).toBeVisible();

  await page.getByText('BabyTop').click();
  await page.getByRole('button', { name: '+ Додати ФОП' }).click();
  await page.getByLabel('Назва ФОП', { exact: true }).fill('ФОП Петренко П.П.');
  await page.getByLabel('Реквізити ФОП', { exact: true }).fill('ІПН 0987654321');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('2 ФОП')).toBeVisible();

  await page.getByLabel('Пошук: клієнт, телефон, ФОП, ІПН').fill('0987654321');
  await page.getByRole('button', { name: 'Знайти' }).click();
  await expect(page.getByText('ФОП Петренко П.П.')).toBeVisible();
  await page.getByRole('button', { name: 'В архів' }).nth(1).click();
  await expect(page.getByText('1 ФОП')).toBeVisible();

  await page.getByRole('link', { name: 'Новий документ' }).click();
  await page.getByLabel('№ замовлення SalesDrive').fill('54969');
  await page.getByRole('button', { name: 'Завантажити' }).click();
  await page.getByLabel('Одержувач').click();
  await page.getByLabel('Одержувач').fill('babytop');
  await expect(page.getByRole('option', { name: /ФОП Іваненко І\.І\./ })).toBeVisible();
  await expect(page.getByRole('option', { name: /ФОП Петренко/ })).toHaveCount(0);
});
