# MEGA SRM

Собственная CRM-надстройка над SalesDrive. **Модуль 1:** по номеру заказа SalesDrive формирует «Рахунок-фактуру» и «Видаткову накладну» в Excel (.xlsx) в виде УкрСклада, с необязательной разбивкой «Мікс» по цветам.

Стек: Next.js 15 (App Router), TypeScript, PostgreSQL 16 + Prisma 6, exceljs, iron-session, Vitest, Playwright.

## Как это работает

1. Менеджер входит по логину и паролю.
2. «Новий документ» → номер заказа → «Завантажити». Заказ читается из SalesDrive (только чтение, ничего не пишется обратно).
3. Выбирается наш ФОП (постачальник) и дата (по умолчанию — дата заказа). Реквизиты получателя вводятся один раз и подставляются автоматически в следующий раз.
4. Строки «Мікс» можно раскидать по цветам (цвета берутся из YML-каталога SalesDrive по артикулу) или оставить как есть.
5. «Рахунок (.xlsx)» / «Видаткова накладна (.xlsx)» — файл скачивается и сохраняется в «Історія».

Нумерация: накладна № = номер заказа SalesDrive; рахунок — свой счётчик для каждого нашего ФОП, с 1 каждый месяц. Повторное формирование сохраняет номер. «Анулювати» не освобождает номер. Если итог документа не совпадает с суммой заказа до копейки, файл не формируется.

## Переменные окружения

| Переменная | Что это |
|---|---|
| `DATABASE_URL` | PostgreSQL, напр. `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | случайная строка ≥ 32 символов (`openssl rand -base64 48`) |
| `SALESDRIVE_BASE_URL` | `https://megazayka.salesdrive.me` |
| `SALESDRIVE_API_KEY` | API-ключ SalesDrive с правом чтения заявок и документов |
| `SALESDRIVE_YML_URL` | ссылка YML-выгрузки каталога (**секрет**: содержит publicKey). Без неё разбивка «Мікс» недоступна |
| `TZ` | `Europe/Kyiv` — месяц рахунку считается по местной дате |
| `SALESDRIVE_MOCK` | `1` — демо-данные вместо SalesDrive (для разработки/e2e) |

## Локальный запуск

```bash
cp .env.example .env            # заполнить значения
docker compose up -d            # PostgreSQL 16 (или свой Postgres)
npm ci
npx prisma migrate deploy
node scripts/create-admin.mjs admin 'надёжный-пароль'
npm run dev                     # http://localhost:3000
```

Тесты: `npm test` (unit + интеграционные; нужна тестовая БД `TEST_DATABASE_URL`, по умолчанию `srm_test`), `npm run e2e` (Playwright, SalesDrive в демо-режиме).

Проверка на реальном SalesDrive:

```bash
SALESDRIVE_BASE_URL=… SALESDRIVE_API_KEY=… SALESDRIVE_YML_URL=… npx tsx scripts/sd-smoke.ts 54969
```

## Деплой (Docker)

```bash
docker build -t mega-srm .
docker run -p 3000:3000 --env-file .env mega-srm   # миграции применяются при старте
docker exec -it <container> node scripts/create-admin.mjs admin 'пароль'
```

**Render (бесплатно) + Neon (бесплатная база)** — основной вариант:
1. neon.com → проект в регионе Frankfurt → Connect → **Connection pooling выключить** → скопировать строку `postgresql://…`.
2. render.com (вход через GitHub) → **New → Blueprint** → репозиторий `mega-srm` (файл `render.yaml`).
3. Заполнить секреты: `DATABASE_URL` (строка Neon), `SALESDRIVE_API_KEY`, `SALESDRIVE_YML_URL`, `ADMIN_LOGIN`, `ADMIN_PASSWORD` → Apply.
4. При старте контейнер сам применяет миграции и создаёт первого админа (только если пользователей ещё нет). После первого входа `ADMIN_PASSWORD` можно удалить.
Бесплатный сервис засыпает после 15 минут без запросов и просыпается примерно за минуту; за $7/мес (Starter) не засыпает.

**Railway** (≈ $5–10/мес): New Project → Deploy from GitHub repo `mega-srm` (Dockerfile подхватится сам) → Add PostgreSQL → в Variables сервиса задать `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SESSION_SECRET`, `SALESDRIVE_*`, `TZ=Europe/Kyiv` → Deploy. Первого админа создать через Railway Shell: `node scripts/create-admin.mjs admin 'пароль'`.

**Render**: New → Web Service из репозитория (Docker) + New → PostgreSQL; переменные те же.

## Бэкап базы

```bash
pg_dump "$DATABASE_URL" -Fc -f mega-srm-$(date +%F).dump      # снять
pg_restore -d "$DATABASE_URL" --clean mega-srm-2026-11-17.dump  # восстановить
```

В базе хранятся пользователи, наши ФОП, реквизиты клиентов, счётчики и история документов (снимки строк). Каталог, цены и заказы не копируются — всегда читаются из SalesDrive.

## Структура

```
src/domain/      чистая логика: штрихкод, сумма прописью, формат, сборка строк/«Мікс»/скидок
src/salesdrive/  клиент API, YML-каталог, демо-режим
src/excel/       рендер .xlsx
src/services/    нумерация, формирование/история/анулювання документов
src/auth/        сессии, пароли, роли
app/             страницы и API (Next.js)
prisma/          схема и миграции
tests/, e2e/     тесты
```
