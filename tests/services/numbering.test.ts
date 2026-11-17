import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb, makeFop } from '../setup/db';
import { nextInvoiceNumber } from '../../src/services/numbering';

const nov = new Date(2026, 10, 4);
const dec = new Date(2026, 11, 1);
const next = (fopId: number, d: Date) => prisma.$transaction(tx => nextInvoiceNumber(tx, fopId, d));

describe('nextInvoiceNumber', () => {
  let f1: number, f2: number;
  beforeEach(async () => {
    await resetDb();
    f1 = (await makeFop('ФОП 1')).id;
    f2 = (await makeFop('ФОП 2')).id;
  });
  afterAll(() => prisma.$disconnect());

  it('starts at 1 per FOP and month, then increments', async () => {
    expect(await next(f1, nov)).toBe(1);
    expect(await next(f1, nov)).toBe(2);
    expect(await next(f2, nov)).toBe(1);
    expect(await next(f1, dec)).toBe(1);
    expect(await next(f1, new Date(2026, 10, 30, 23, 59))).toBe(3);
  });

  it('10 parallel transactions get 1..10 without gaps or duplicates', async () => {
    const nums = await Promise.all(Array.from({ length: 10 }, () => next(f1, nov)));
    expect([...nums].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('rolled back transaction does not consume a number', async () => {
    await expect(prisma.$transaction(async tx => { await nextInvoiceNumber(tx, f1, nov); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await next(f1, nov)).toBe(1);
  });
});
