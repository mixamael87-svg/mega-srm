import { describe, it, expect } from 'vitest';
import { amountInWordsUah } from '../../src/domain/amountInWords';

describe('amountInWordsUah', () => {
  const cases: [number, string][] = [
    [3962855, "Тридцять дев'ять тисяч шістсот двадцять вісім гривень 55 копійок"],
    [779608, "Сім тисяч сімсот дев'яносто шість гривень 08 копійок"],
    [100, 'Одна гривня 00 копійок'],
    [201, 'Дві гривні 01 копійка'],
    [2100, 'Двадцять одна гривня 00 копійок'],
    [1112, 'Одинадцять гривень 12 копійок'],
    [100000, 'Одна тисяча гривень 00 копійок'],
    [200000, 'Дві тисячі гривень 00 копійок'],
    [500000, "П'ять тисяч гривень 00 копійок"],
    [100000000, 'Один мільйон гривень 00 копійок'],
    [1, 'Нуль гривень 01 копійка'],
    [4, 'Нуль гривень 04 копійки'],
  ];
  for (const [k, s] of cases) it(`${k} → ${s}`, () => expect(amountInWordsUah(k)).toBe(s));
  it('extra: 11 000 and 1 300 000', () => {
    expect(amountInWordsUah(1100000)).toBe('Одинадцять тисяч гривень 00 копійок');
    expect(amountInWordsUah(130000000)).toBe('Один мільйон триста тисяч гривень 00 копійок');
    expect(amountInWordsUah(4200000000)).toBe('Сорок два мільйони гривень 00 копійок');
  });
  it('rejects negative / non-integer', () => {
    expect(() => amountInWordsUah(-1)).toThrow();
    expect(() => amountInWordsUah(1.5)).toThrow();
  });
});
