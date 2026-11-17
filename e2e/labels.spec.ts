import { test, expect } from '@playwright/test';

test('labels tab: add a helper label and a label that prints it, search, mark too-long text', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Логін').fill('admin');
  await page.getByLabel('Пароль').fill('adminpass1');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await page.getByRole('link', { name: 'Наклейки' }).click();
  await expect(page.getByRole('heading', { name: 'Наклейки' })).toBeVisible();
  await page.getByRole('tab', { name: /ТОВ Кузкас/ }).click();

  await page.getByRole('button', { name: '+ Нова наклейка' }).click();
  await page.getByLabel('Артикул (4 цифри; порожньо — службова)').fill('');
  await page.getByLabel('Назва службової наклейки').fill('Частина 2 (тест)');
  await page.getByLabel('Текст наклейки').fill('Правила використання');
  await page.getByLabel('Штрихкод').selectOption('none');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByRole('cell', { name: 'Частина 2 (тест)' })).toBeVisible();

  await page.getByRole('button', { name: '+ Нова наклейка' }).click();
  await page.getByLabel('Артикул (4 цифри; порожньо — службова)').fill('1205');
  await page.getByLabel('Текст наклейки').fill('Іграшка-пищалка\nАрт. 1205');
  await page.getByLabel('Знак відповідності').check();
  await page.getByLabel('Друкувати після кожної штуки').selectOption({ label: 'Частина 2 (тест)' });
  await page.getByRole('button', { name: 'Зберегти' }).click();
  const row = page.getByRole('row').filter({ hasText: '1205' });
  await expect(row).toContainText('+ Частина 2 (тест)');
  await expect(row).toContainText('4826077012052');

  await row.getByRole('button', { name: 'Змінити' }).click();
  await expect(page.locator('iframe[title="Перегляд наклейки"]')).toBeVisible();
  await page.getByLabel('Текст наклейки').fill('дуже довгий текст '.repeat(200));
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(row).toContainText('не вміщається');

  await page.getByLabel('Пошук: артикул або текст').fill('пищалка');
  await page.getByRole('button', { name: 'Знайти' }).click();
  await expect(page.getByRole('cell', { name: 'Наклейок немає' })).toBeVisible(); // the text was replaced
});
