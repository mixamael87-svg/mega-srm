import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb } from '../setup/db';
import { createClientCodeService } from '../../src/services/clientCodes';

describe('client codes', () => {
  const svc = createClientCodeService(prisma);
  let clientId = 0;
  beforeEach(async () => { await resetDb(); clientId = (await prisma.client.create({ data: { name: 'Family Toys' } })).id; });
  afterAll(() => prisma.$disconnect());

  it('learns from barcodes, keeps manual mappings, validates SKU', async () => {
    await svc.setManual(clientId, '90001', '0907');
    await svc.learn(clientId, new Map([['88514', '0909'], ['90001', '0101']]));
    expect([...(await svc.load(clientId))].sort()).toEqual([['88514', '0909'], ['90001', '0907']]);
    await expect(svc.setManual(clientId, '1', '123')).rejects.toMatchObject({ status: 400 });
    await svc.remove(clientId, '88514');
    expect([...(await svc.load(clientId))]).toEqual([['90001', '0907']]);
    expect([...(await svc.load(99999))]).toEqual([]);
  });
});
