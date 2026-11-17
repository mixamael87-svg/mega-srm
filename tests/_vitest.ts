// Minimal vitest-compatible shim over node:test.
// When vitest is installed, replace `from '../_vitest'` with `from 'vitest'`.
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

type ErrMatcher = string | RegExp | ((e: unknown) => boolean) | (new (...a: any[]) => Error) | Record<string, unknown>;

function matchError(err: unknown, m?: ErrMatcher) {
  if (m === undefined) return;
  if (typeof m === 'string') return assert.ok(String((err as Error)?.message).includes(m), `error message should include "${m}", got "${(err as Error)?.message}"`);
  if (m instanceof RegExp) return assert.match(String((err as Error)?.message), m);
  if (typeof m === 'function' && m.prototype instanceof Error) return assert.ok(err instanceof (m as any), `expected instance of ${m.name}`);
  if (typeof m === 'function') return assert.ok((m as (e: unknown) => boolean)(err));
  for (const [k, v] of Object.entries(m)) assert.deepEqual((err as any)?.[k], v, `error.${k}`);
}

export function expect<T>(actual: T) {
  const api = {
    toBe: (e: T) => assert.strictEqual(actual, e),
    toEqual: (e: unknown) => assert.deepStrictEqual(actual, e),
    toBeNull: () => assert.strictEqual(actual, null),
    toBeTruthy: () => assert.ok(actual),
    toBeFalsy: () => assert.ok(!actual),
    toHaveLength: (n: number) => assert.strictEqual((actual as any).length, n),
    toContain: (x: unknown) => assert.ok((actual as any).includes(x), `expected to contain ${String(x)}`),
    toMatchObject: (o: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(o)) assert.deepStrictEqual((actual as any)[k], v, `.${k}`);
    },
    toThrow: (m?: ErrMatcher) => {
      let thrown = false, err: unknown;
      try { (actual as any)(); } catch (e) { thrown = true; err = e; }
      assert.ok(thrown, 'expected function to throw');
      matchError(err, m);
    },
    rejects: {
      toThrow: async (m?: ErrMatcher) => {
        let thrown = false, err: unknown;
        try { await (actual as any); } catch (e) { thrown = true; err = e; }
        assert.ok(thrown, 'expected promise to reject');
        matchError(err, m);
      },
    },
    not: {
      toBe: (e: T) => assert.notStrictEqual(actual, e),
      toContain: (x: unknown) => assert.ok(!(actual as any).includes(x), `expected not to contain ${String(x)}`),
    },
  };
  return api;
}

export { describe, it, test };
