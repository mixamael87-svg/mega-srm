# «Звіти клієнтів» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Загрузка отчётов клиентов (Bagel: оборот и остатки) → таблица в наших артикулах/названиях с ручной новой ценой → Excel в нашем формате, «Накладна на повернення» и «Видаткова накладна» переоценки.

**Architecture:** Разбор файла — чистые функции `src/reports/*` (чтение .xls в `string[][]`, разбор Bagel, сопоставление, агрегация), без БД. Сопоставления кодов клиента — таблица `ClientCode`. Документы переоценки — отдельная модель `ReportDocument` со своим счётчиком, чтобы не трогать нумерацию, уникальный индекс и логику документов по заказам; «Історія» показывает обе модели одним списком. Сервер без состояния: разобранный отчёт живёт в браузере, на документ/экспорт отправляются строки.

**Tech Stack:** как в проекте + **SheetJS `xlsx` 0.20.3 с `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`** (версия из npm 0.18.5 уязвима при чтении чужих файлов: CVE-2023-30533, CVE-2024-22363 — не использовать). Нужен домен `cdn.sheetjs.com` в разрешённых доменах среды разработки; Render качает его при сборке.

**Spec:** `docs/superpowers/specs/2026-11-19-zvity-klientiv-design.md`

## Global Constraints

- Интерфейс на украинском: «Звіти клієнтів», «Завантажити», «Магазин», «Усі», «Нова ціна», «Не розпізнано», «Excel (наш формат)», «Накладна на повернення», «Видаткова накладна».
- Деньги — копейки (integer); цены отчёта `"154.10"`/`154.1` → `Math.round(x*100)`.
- Наш артикул из штрихкода только если штрихкод = `ean13FromSku(sku)` для `sku = barcode.slice(8,12)` (префикс `48260770` + верная контрольная цифра).
- **Реальные отчёты клиентов в репозиторий не коммитить** (репозиторий открыт): фикстуры — синтетические .xls той же структуры, генерируются скриптом `scripts/make-report-fixtures.ts`. Реальные файлы — только для ручной проверки вне репо.
- Файл ≤ 5 МБ; .xls/.xlsx; не распознан → 422 «Формат файлу не розпізнано».
- Ничего не писать в SalesDrive. Все действия — любому вошедшему; удаление сопоставления кода — admin.

## Review Focus

1. **Итог не сходится с «Разом»** (строка потерялась при разборе) → 422 с текстом «Кількість не збігається з підсумком звіту (… ≠ …)», а не таблица без строки. → Task 1.
2. **Чужой/битый штрихкод** (`4820288950011`, `48260770000X` с неверной контрольной цифрой, пусто) и кода нет в сопоставлениях → строка в «Не розпізнано», не потеряна и не сопоставлена с чужим артикулом. → Task 2.
3. **Один код клиента с двумя разными нашими артикулами** (в разных строках разные штрихкоды) → сопоставление не запоминается, обе строки сопоставлены по своему штрихкоду; предупреждение в ответе. → Task 2.
4. **Совпадение номера документа** с уже выданным того же вида и ФОП → 409 `DUPLICATE_NUMBER`, формирование только с явным подтверждением (`allowDuplicate: true`). → Task 3.
5. **Нова ціна не заполнена или ≤ 0** у части строк → «Видаткова накладна» недоступна; API отвечает 400 «Вкажіть нову ціну для всіх рядків». → Task 3, Task 4.

---

### Task 1: Чтение .xls и разбор Bagel

**Files:** Create `src/reports/xls.ts`, `src/reports/types.ts`, `src/reports/bagel.ts`, `scripts/make-report-fixtures.ts`, `tests/fixtures/reports/bagel-turnover.xls`, `tests/fixtures/reports/bagel-stock.xls`; Test `tests/reports/bagel.test.ts`.

**Interfaces — Produces:**
```ts
// types.ts
type ReportKind = 'turnover' | 'stock';
type RawLine = { store: string; code: string; name: string; barcode: string; priceKop: number;
  qty: number;              // stock: К-сть; turnover: залишок на кінець
  opening?: number; incoming?: number; soldRetail?: number; soldOther?: number }; // turnover only
type ParsedReport = { format: 'bagel'; kind: ReportKind; client: string; title: string;
  dateFrom: string | null; dateTo: string; stores: string[]; lines: RawLine[] };
// xls.ts
function readSheetRows(buf: Buffer): string[][]   // first sheet, every cell as displayed text, '' for empty
// bagel.ts
function isBagel(rows: string[][]): boolean
function parseBagel(rows: string[][]): ParsedReport   // throws ReportParseError(code, message)
class ReportParseError extends Error { code: 'UNKNOWN_FORMAT' | 'TOTAL_MISMATCH' }
```
Колонки ищутся по тексту заголовка в строке, где первая ячейка `Код`: `Назва`, `Ціна закупки`, `Штрих код`, `К-сть`, `Документи приходу`, `Документи роздрібного продажу`, `Документи продажу`; в обороте остаток на начало/конец — две ячейки-даты заголовка (первая — начало, последняя — конец). Названия — `trim()`. Числа — с запятой-разделителем тысяч (`"62,969.40"`) и без.

- [ ] Step 1: скрипт фикстур (синтетика, структура как у образцов: 2 магазина, 2 категории, повтор кода в одном магазине, 1 строка с чужим штрихкодом, итоги «Разом Підрозділ/Постачальник/Разом», подвал с датой) — пишет оба .xls через SheetJS (`bookType: 'biff8'`).
- [ ] Step 2: failing tests: stock → `kind 'stock'`, `dateTo '02.11.2026'`, 2 магазина, N строк, у повтора две строки; turnover → поля opening/incoming/soldRetail/soldOther/qty, `dateFrom '01.10.2026'`; сумма `qty` = значение «Разом»; испорченный итог → `TOTAL_MISMATCH`; таблица без `Код`/`Назва` → `UNKNOWN_FORMAT`; ручная проверка на реальных образцах (вне репо): 472 строки остатков, 419 оборота, суммы = «Разом».
- [ ] Step 3: run → FAIL. Step 4: implement. Step 5: run → PASS. Step 6: commit `feat(reports): read xls and parse Bagel reports`.

### Task 2: Сопоставление с нашими артикулами и агрегация

**Files:** Modify `prisma/schema.prisma` (+ миграция `client_codes`); Create `src/reports/match.ts`, `src/reports/aggregate.ts`, `src/services/clientCodes.ts`; Test `tests/reports/match.test.ts`, `tests/reports/aggregate.test.ts`, `tests/services/clientCodes.test.ts`.

**Interfaces:**
- Schema: `ClientCode { clientId Int; code String; sku String; source String /* 'barcode' | 'manual' */; updatedAt; @@id([clientId, code]) }`, relation to `Client` `onDelete: Cascade`.
- `skuFromBarcode(barcode: string): string | null` (match.ts).
- `matchLines(lines: RawLine[], known: Map<string, string>): { matched: (RawLine & { sku: string })[]; unmatched: RawLine[]; learned: Map<string, string>; conflicts: string[] /* codes with 2 skus */ }` — штрихкод важнее запомненного; `learned` — только коды, у которых во всех строках один и тот же sku.
- `createClientCodeService(prisma)`: `load(clientId): Promise<Map<string,string>>`, `learn(clientId, learned)` (не перезаписывает `manual`), `setManual(clientId, code, sku)` (sku ровно 4 цифры, иначе 400), `remove(clientId, code)` (admin в API).
- `aggregate(lines: (RawLine & { sku: string })[], store: string | 'ALL'): AggRow[]` — `AggRow = { sku; priceKop; qty; opening?; incoming?; soldRetail?; soldOther? }`, ключ (sku, priceKop), порядок — первое появление.

- [ ] Step 1: failing tests — штрихкод `4826077009090` → sku `0909`; `4820288950011`, неверная контрольная, пусто → null; строка без штрихкода с известным кодом → sku из map; конфликт кода → не в `learned`, в `conflicts`; повтор (магазин×sku×цена) складывается; `ALL` суммирует магазины; разные цены одного sku → две строки; `learn` не трогает `manual`; `setManual('123')` → 400.
- [ ] Step 2: FAIL → implement → PASS. Step 3: commit `feat(reports): match client codes to our SKUs and aggregate`.

### Task 3: Документы переоценки

**Files:** Modify `prisma/schema.prisma` (+ миграция `report_documents`), `src/excel/common.ts` (layout для повернення — та же сетка, что у накладної, заголовок «Накладна на повернення»); Create `src/excel/renderPovernennya.ts`, `src/services/reportDocuments.ts`, `app/api/report-documents/route.ts` (GET list, POST create), `app/api/report-documents/next-number/route.ts`, `app/api/report-documents/[id]/file/route.ts`, `app/api/report-documents/[id]/annul/route.ts`; Test `tests/services/reportDocuments.test.ts`, `tests/api/reportDocuments.test.ts`.

**Interfaces:**
- Schema: `enum ReportDocKind { POVERNENNYA PEREOTSINKA }`; `ReportDocument { id; kind; number Int; date @db.Date; clientId Int? (SetNull); counterFopId Int?; status DocStatus; headerJson; linesJson; totalsJson; createdById; createdAt }`; `ReportCounter { kind; fopId; year; month; last; @@id([kind, fopId, year, month]) }`.
- `Party = { type: 'our' | 'client'; id: number }`.
- `createReportDocumentService(prisma)`:
  - `nextNumber(kind, fopId, date): Promise<number>` — без резерва (последний + 1).
  - `create(input: { kind; number: number; date: Date; supplier: Party; recipient: Party; clientId: number; lines: { sku: string; name: string; qty: number; priceKop: number }[]; allowDuplicate?: boolean; userId }): Promise<{ id; number; file: Buffer; filename }>` — счётчик по нашей стороне (POVERNENNYA → recipient, PEREOTSINKA → supplier, если `type === 'our'`; если введённый номер > счётчика — счётчик = номер); шапка — `partyText`; строки → `DocLine` с `barcode = ean13FromSku(sku)`; итоги gross = net; ошибки: пустые строки / qty ≤ 0 / priceKop ≤ 0 → 400 «Вкажіть нову ціну для всіх рядків» (для PEREOTSINKA) / «Немає рядків»; совпадение номера (тот же kind, та же наша сторона, тот же год-месяц, ACTIVE) без `allowDuplicate` → 409 `DUPLICATE_NUMBER`.
  - `list()`, `download(id)`, `annul(id)` (как у документов).
- Имена файлов: `Накладна_на_повернення_<N>_<YYYY-MM-DD>.xlsx`, `Видаткова_накладна_переоцінка_<N>_<YYYY-MM-DD>.xlsx`.

- [ ] Step 1: failing tests — повернення: сторона-получатель наш ФОП → номер 1, затем 2; сумма = Σ qty×price; заголовок «Накладна на повернення № 1»; переоценка с ручным номером 7 → следующий предложенный 8; повтор номера → 409, с `allowDuplicate` → создан; цена 0 → 400; обе стороны клиентские → счётчик не трогается, номер обязателен; download из снимка; annul.
- [ ] Step 2: FAIL → implement → PASS. Step 3: commit `feat(reports): revaluation documents with their own numbering`.

### Task 4: API разбора, Excel «наш формат», экран и история

**Files:** Create `app/api/reports/parse/route.ts` (POST multipart `clientId`, `file`), `app/api/reports/codes/route.ts` (POST setManual, DELETE admin), `app/api/reports/export/route.ts` (POST → xlsx), `src/reports/exportXlsx.ts`, `src/reports/names.ts`, `app/(app)/reports/page.tsx`, `app/(app)/reports/ReportsClient.tsx`; Modify `app/(app)/layout.tsx` (пункт «Звіти клієнтів»), `app/(app)/documents/History.tsx` + `app/api/documents/route.ts` (объединённый список: `source: 'order' | 'report'`); `package.json` (`xlsx` из CDN); Test `tests/api/reports.test.ts`, `tests/reports/export.test.ts`, `e2e/reports.spec.ts`.

**Interfaces:**
- `POST /api/reports/parse` → `{ report: Omit<ParsedReport,'lines'>, matched: (RawLine & { sku; ourName })[], unmatched: RawLine[], conflicts: string[] }` (learn вызывается здесь).
- `ourName(sku, sd)`: товар «Мікс» по артикулу, иначе первый; нет в каталоге → `null` (UI покажет название клиента с пометкой «(з звіту)»).
- `exportReportXlsx(meta, rows: (AggRow & { name: string; newPriceKop?: number })[], kind): Promise<Buffer>` — колонки: Артикул, Назва, Штрихкод, (оборот: Залишок на початок, Прихід, Продано (роздріб), Продано (інше)), К-сть / Залишок на кінець, Стара ціна, Нова ціна, Сума стара, Сума нова; шапка: клиент, тип, период/дата, магазин.
- UI — по скетчу спеки; «Нова ціна» — поле на строку + «заповнити старою ціною» для удобства; блок «Не розпізнано» с полем «наш артикул» → POST codes → перезапрос parse не нужен: строка переносится в таблицу локально; формы документов — выбор сторон (наші ФОП + ФОП клиента), дата, номер (подставляется из next-number при выборе нашей стороны), подтверждение при 409.

- [ ] Step 1: failing tests — API parse синтетических фикстур (stock: matched/unmatched counts, learned codes сохраняются, второй разбор остатков без штрихкодов сопоставляется полностью); не-Bagel → 422; >5 МБ → 413; export: заголовки колонок и суммы; History: в списке есть строка повернення.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: e2e `reports.spec.ts`: клиент → загрузить синтетический оборот → загрузить остатки → «Не розпізнано» 1 → ввести артикул → «Накладна на повернення» (скачан, номер 1) → «заповнити старою ціною», одну цену изменить → «Видаткова накладна» (скачан) → обе в «Історії».
- [ ] Step 4: verify all: `npx vitest run && npx playwright test && npx tsc --noEmit && npx next build`. Ручная проверка на реальных образцах (вне репо): итоги сходятся, 2 нераспознанные строки.
- [ ] Step 5: commit `feat(reports): client reports screen, export and history`.
