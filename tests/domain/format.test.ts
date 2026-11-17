import { describe, it, expect } from '../_vitest';
import { formatMoney, formatQty, formatDocDate } from '../../src/domain/format';

describe('format', () => {
  it('money', () => {
    expect(formatMoney(3962855)).toBe('39628,55');
    expect(formatMoney(1)).toBe('0,01');
    expect(formatMoney(0)).toBe('0,00');
    expect(formatMoney(-5050)).toBe('-50,50');
  });
  it('qty', () => {
    expect(formatQty(6)).toBe('6,00');
    expect(formatQty(1.5)).toBe('1,50');
  });
  it('doc date', () => {
    expect(formatDocDate(new Date(2026, 10, 4))).toBe('04 листопада 2026 р.');
    expect(formatDocDate(new Date(2026, 0, 12))).toBe('12 січня 2026 р.');
  });
});
