# Права менеджера — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** менеджер создаёт/правит наших ФОП, импортирует их и анулирует документы; удаление и пользователи — только admin.
**Spec:** `docs/superpowers/specs/2026-11-18-manager-rights-design.md`

## Review Focus
1. Менеджер шлёт `PATCH /api/fops` с `archived` (в обход кнопок) → 403, ФОП не изменён.
2. Менеджер `DELETE /api/fops/:id`, `/api/clients/:id`, `/api/client-fops/:id` → 403 (уже есть тесты — должны остаться зелёными).
3. Менеджер `/api/users` → 403 (уже есть).

### Task 1
**Files:** `app/api/fops/route.ts`, `app/api/fops/import/route.ts`, `app/api/documents/[id]/annul/route.ts`, `app/(app)/layout.tsx`, `app/(app)/settings/fops/page.tsx`, `app/(app)/settings/fops/FopsClient.tsx`, `app/(app)/documents/page.tsx`, `app/(app)/documents/History.tsx`; tests `tests/api/fops.test.ts`, `tests/api/annul.test.ts`.
- [ ] Step 1: failing tests — manager: POST /api/fops → 201; PATCH name/requisites/isDefault → 200; PATCH {archived:true} → 403 and FOP unchanged; POST /api/fops/import → 200; POST /api/documents/:id/annul → 200 (status ANNULLED). 
- [ ] Step 2: run → FAIL. Step 3: implement (UI: «Наші ФОП» в меню всем; «Видалити»/«Повернути» и плашка архива-действий — только admin; «Анулювати» — всем). Step 4: vitest + playwright + tsc + build → PASS.
- [ ] Step 5: commit `feat: managers can edit our FOPs and annul documents`
