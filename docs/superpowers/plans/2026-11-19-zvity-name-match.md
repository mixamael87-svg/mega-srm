# Подсказка артикула по названию — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** в «Звітах клієнтів» каждая строка получает артикул (штрихкод / сохранённый код / подсказка по названию), поле для правки и цену = цена закупки.
**Spec:** `docs/superpowers/specs/2026-11-19-zvity-name-match-design.md`

## Review Focus
1. Подсказка ниже порога 0,35 → пусто, не «лучшее из плохого».
2. Сохранённый вручную код всегда важнее подсказки и штрихкода? — штрихкод важнее (как раньше), сохранённый — важнее подсказки.
3. Документы/Excel заблокированы при 🟡/⚪ строках.

### Task 1
**Files:** Create `src/reports/suggest.ts`; Modify `src/salesdrive/client.ts` + `src/salesdrive/mock.ts` (`listProducts(): Promise<SdProduct[]>`), `src/reports/aggregate.ts` (`aggregateByCode(lines: RawLine[], store): CodeRow[]`), `app/api/reports/parse/route.ts` (ответ `{ report, lines: ResolvedLine[], conflicts }`, `ResolvedLine = RawLine & { sku: string | null; source: 'barcode' | 'saved' | 'name' | null; ourName: string | null; catalog: Record<string,string> }` — каталог sku→наше название отдаётся один раз в ответе), `app/api/reports/codes/route.ts` (тело `{ clientId, items: [{ code, sku }] }`), `app/(app)/reports/ReportsClient.tsx`; Tests `tests/reports/suggest.test.ts`, `tests/api/reports.test.ts`, `tests/salesdrive/client.test.ts`, `e2e/reports.spec.ts`.
- `createNameIndex(products: SdProduct[]): { suggest(name: string): { sku: string; name: string; score: number } | null }` — триграммы по нормализованному тексту (нижний регистр, без кавычек/скобок/пунктуации), коэффициент Дайса; < 0,35 → null; при равном счёте — товар «Мікс».
- [ ] Step 1: failing tests. Step 2: FAIL → implement → PASS. Step 3: vitest + playwright + tsc + build. Step 4: commit `feat(reports): suggest SKU by name, edit SKU and price in every row`.
