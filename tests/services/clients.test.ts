import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, resetDb } from '../setup/db';
import { createClientService } from '../../src/services/clients';

describe('clients directory', () => {
  const svc = createClientService(prisma);
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  const babytop = () => svc.createClient({ name: 'BabyTop', phone: '067 111 22 33', fop: { name: 'ФОП Іваненко І.І.', requisites: 'Юр. адреса: Київ\nІПН 1234567890' } });

  it('creates a client with its first FOP and adds more', async () => {
    const c = await babytop();
    expect(c).toMatchObject({ name: 'BabyTop', phone: '067 111 22 33', comment: '' });
    expect(c.fops).toEqual([expect.objectContaining({ name: 'ФОП Іваненко І.І.', archived: false })]);
    await svc.addFop(c.id, { name: 'ФОП Петренко П.П.', requisites: 'ІПН 0987654321' });
    const [one] = await svc.listClients({});
    expect(one!.fops.map(f => f.name)).toEqual(['ФОП Іваненко І.І.', 'ФОП Петренко П.П.']);
  });

  it('searches by client name, phone, FOP name and requisites, case-insensitive', async () => {
    await babytop();
    await svc.createClient({ name: 'Інший', fop: { name: 'ФОП Сидоренко', requisites: 'ІПН 5555555555' } });
    for (const q of ['babytop', 'BABYTOP', '067 111', 'іваненко', '1234567890']) {
      expect((await svc.listClients({ q })).map(c => c.name)).toEqual(['BabyTop']);
    }
    expect(await svc.listClients({ q: 'нема' })).toEqual([]);
    expect((await svc.listClients({})).map(c => c.name)).toEqual(['BabyTop', 'Інший']);
  });

  it('archived FOPs are hidden from lists and recipient options unless asked', async () => {
    const c = await babytop();
    const f2 = await svc.addFop(c.id, { name: 'ФОП Петренко П.П.', requisites: 'ІПН 0987654321' });
    await svc.updateFop(f2.id, { archived: true });
    expect((await svc.listClients({}))[0]!.fops.map(f => f.name)).toEqual(['ФОП Іваненко І.І.']);
    expect((await svc.listClients({ includeArchived: true }))[0]!.fops).toHaveLength(2);
    expect((await svc.recipientOptions()).map(o => [o.clientName, o.fopName])).toEqual([['BabyTop', 'ФОП Іваненко І.І.']]);
    await svc.updateFop(f2.id, { archived: false });
    expect(await svc.recipientOptions()).toHaveLength(2);
  });

  it('edits client and FOP', async () => {
    const c = await babytop();
    await svc.updateClient(c.id, { phone: '050 000 00 00', comment: 'сеть' });
    await svc.updateFop(c.fops[0]!.id, { requisites: 'ІПН 1111111111' });
    const [one] = await svc.listClients({});
    expect(one).toMatchObject({ phone: '050 000 00 00', comment: 'сеть' });
    expect(one!.fops[0]!.requisites).toBe('ІПН 1111111111');
  });

  it('blank fields → 400, unknown ids → 404', async () => {
    await expect(svc.createClient({ name: '   ' })).rejects.toMatchObject({ status: 400 });
    const c = await svc.createClient({ name: 'X' });
    expect(c.fops).toEqual([]);
    await expect(svc.addFop(c.id, { name: 'ФОП', requisites: '  ' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.addFop(c.id, { name: ' ', requisites: 'ІПН 1' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.updateClient(c.id, { name: ' ' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.updateFop(99999, { name: 'a' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.addFop(99999, { name: 'a', requisites: 'b' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.updateClient(99999, { name: 'a' })).rejects.toMatchObject({ status: 404 });
  });
});
