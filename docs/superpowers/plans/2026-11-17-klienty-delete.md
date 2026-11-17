# Удаление клиентов и ФОП — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** удаление клиента/ФОП насовсем (admin), с двойным предупреждением; история документов сохраняет название получателя.
**Spec:** `docs/superpowers/specs/2026-11-17-klienty-delete-design.md`

## Global Constraints
- Удаляет только admin; менеджер → 403. Ничего не пишется в SalesDrive.
- Документы и их файлы после удаления клиента остаются и скачиваются; в истории «<первая строка снимка получателя> (видалено)».

## Review Focus
1. Удаление клиента с документами → документ остаётся, скачивается, `clientFopId = null`, история показывает «(видалено)». → Task 1.
2. Перегенерация документа с удалённым получателем и новым `recipientFopId` → работает, номер тот же. → Task 1.
3. Несуществующий id → 404; не admin → 403. → Task 1.
4. `ContactDefault` на удалённый ФОП исчезает, подстановка → null. → Task 1.

### Task 1: удаление (схема, сервис, API, UI, e2e)
**Files:** `prisma/schema.prisma` + миграция `client_delete`; `src/services/clients.ts` (`deleteClient(id)`, `deleteFop(id)`, `usage(clientId)` → `{ fops: number; documents: number }`, `fopUsage(id)` → `{ documents: number }`); `src/services/documents.ts` (`listDocuments` fallback); `app/api/clients/[id]/route.ts` (DELETE), `app/api/clients/[id]/usage/route.ts` (GET), `app/api/client-fops/[id]/route.ts` (DELETE, GET usage via `?usage=1`); `app/(app)/clients/*` (кнопки только для admin); тесты `tests/services/clients.test.ts`, `tests/services/documents.test.ts`, `tests/api/clients.test.ts`, `e2e/clients.spec.ts`.
- [ ] Step 1: failing tests (service: delete client with FOPs+document → client/FOPs gone, document stays with clientFopId null, download works, listDocuments clientName 'ФОП Палій Анна (видалено)', defaultRecipientFor → null, regenerate with new recipient keeps number; usage counts; 404s. API: manager DELETE → 403, admin → 200. e2e: admin deletes a client: 1st panel → «Так, видалити» → dialog accepted → client gone).
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run vitest + playwright + tsc + build → PASS.
- [ ] Step 5: commit `feat: delete clients and FOPs (admin, double confirmation)`
