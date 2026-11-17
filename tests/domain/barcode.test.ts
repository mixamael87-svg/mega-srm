import { describe, it, expect } from '../_vitest';
import { ean13FromSku } from '../../src/domain/barcode';

describe('ean13FromSku', () => {
  it('builds EAN-13 from 4-digit sku', () => {
    expect(ean13FromSku('0001')).toBe('4826077000011');
    expect(ean13FromSku('0100')).toBe('4826077001001');
    expect(ean13FromSku('0205')).toBe('4826077002053');
    expect(ean13FromSku('1402')).toBe('4826077014025');
    expect(ean13FromSku('0726')).toBe('4826077007263');
  });
  it('returns empty string for non 4-digit sku', () => {
    for (const bad of ['', 'id_1233', '12345', '12a4', ' 001', '123']) expect(ean13FromSku(bad)).toBe('');
  });
});
