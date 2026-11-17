# Удаление наших ФОП — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** admin удаляет наших ФОП: без документов — насовсем, с документами — в архив (с возвратом).
**Spec:** `docs/superpowers/specs/2026-11-17-our-fops-delete-design.md`

## Global Constraints
- Только admin (менеджер → 403). Нумерация рахунків не должна давать дублей. В SalesDrive ничего не пишется.

## Review Focus
1. ФОП с документами → не удаляется, счётчик и документы целы, следующий рахунок после возврата продолжает нумерацию. → Task 1.
2. Архивный ФОП был основним → `isDefault` снят, по умолчанию подставляется другой. → Task 1.
3. Формирование/перегенерация с архивным ФОП → 409 `FOP_ARCHIVED`. → Task 1.
4. Несуществующий id → 404. → Task 1.

### Task 1: схема, сервис `src/services/ourFops.ts`, API, UI, тесты
**Interfaces:** `createOurFopService(prisma)` → `usage(id): Promise<{ documents: number }>`, `remove(id): Promise<{ deleted: boolean; archived: boolean }>`, `restore(id): Promise<void>`.
- [ ] Step 1: failing tests — service (`tests/services/ourFops.test.ts`): remove w/o docs → gone + counters gone; with docs → archived, isDefault false, counter kept, restore → next rahunok continues numbering; 404. Documents: archived supplier → `FOP_ARCHIVED`. API (`tests/api/fops.test.ts`): manager DELETE → 403; orders preview `fops` without archived, `defaultFopId` skips archived.
- [ ] Step 2: run → FAIL. Step 3: implement (миграция `our_fop_archive`). Step 4: vitest + playwright + tsc + build → PASS.
- [ ] Step 5: commit `feat: delete or archive our FOPs (admin)`
