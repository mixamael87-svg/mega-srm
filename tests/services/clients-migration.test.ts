import { describe, it, expect, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { prisma } from '../setup/db';

const dir = new URL('../../prisma/migrations/', import.meta.url);
const migrations = readdirSync(dir).filter(d => /^\d+_/.test(d)).sort();
const sqlOf = (m: string) => readFileSync(new URL(`${m}/migration.sql`, dir), 'utf8')
  .split(/;\s*(?:\r?\n|$)/).map(s => s.trim()).filter(s => s && !/^(--[^\n]*\n?)+$/.test(s));

describe('migration "clients" on a database with module-1 data', () => {
  afterAll(async () => { await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS legacy_test CASCADE'); await prisma.$disconnect(); });

  it('turns every legacy ClientFop into a client, keeps documents, fills ContactDefault', async () => {
    const target = migrations.findIndex(m => m.endsWith('_clients'));
    expect(target).toBeGreaterThan(0);
    const rows = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('DROP SCHEMA IF EXISTS legacy_test CASCADE');
      await tx.$executeRawUnsafe('CREATE SCHEMA legacy_test');
      await tx.$executeRawUnsafe('SET LOCAL search_path TO legacy_test');
      for (const m of migrations.slice(0, target)) for (const s of sqlOf(m)) await tx.$executeRawUnsafe(s);
      // data as it exists in production after module 1
      await tx.$executeRawUnsafe(`INSERT INTO "User"(login,"passwordHash",role) VALUES ('admin','x','admin')`);
      await tx.$executeRawUnsafe(`INSERT INTO "OurFop"(name,requisites) VALUES ('ФОП Кузнецов','ІПН 1')`);
      await tx.$executeRawUnsafe(`INSERT INTO "ClientFop"("sdContactId",name,requisites) VALUES (501,'ФОП Баглай','ІПН 111'),(502,'ФОП Курочкін','ІПН 222')`);
      await tx.$executeRawUnsafe(`INSERT INTO "Document"(type,number,date,"fopId","clientFopId","sdOrderId","createdById","updatedAt") VALUES ('NAKLADNA',54969,'2026-11-12',1,1,54969,1,now())`);
      for (const s of sqlOf(migrations[target]!)) await tx.$executeRawUnsafe(s);
      const clients = await tx.$queryRawUnsafe<{ id: number; name: string }[]>('SELECT id, name FROM "Client" ORDER BY id');
      const fops = await tx.$queryRawUnsafe<{ id: number; clientId: number; name: string; archived: boolean }[]>('SELECT id, "clientId", name, archived FROM "ClientFop" ORDER BY id');
      const defaults = await tx.$queryRawUnsafe<{ sdContactId: number; clientFopId: number }[]>('SELECT "sdContactId", "clientFopId" FROM "ContactDefault" ORDER BY 1');
      const doc = await tx.$queryRawUnsafe<{ clientFopId: number }[]>('SELECT "clientFopId" FROM "Document"');
      const cols = await tx.$queryRawUnsafe<{ column_name: string }[]>(`SELECT column_name FROM information_schema.columns WHERE table_schema='legacy_test' AND table_name='ClientFop'`);
      return { clients, fops, defaults, doc, cols: cols.map(c => c.column_name) };
    });
    expect(rows.clients.map(c => c.name)).toEqual(['ФОП Баглай', 'ФОП Курочкін']);
    expect(rows.fops).toEqual([
      { id: 1, clientId: rows.clients[0]!.id, name: 'ФОП Баглай', archived: false },
      { id: 2, clientId: rows.clients[1]!.id, name: 'ФОП Курочкін', archived: false },
    ]);
    expect(rows.defaults).toEqual([{ sdContactId: 501, clientFopId: 1 }, { sdContactId: 502, clientFopId: 2 }]);
    expect(rows.doc).toEqual([{ clientFopId: 1 }]);
    expect(rows.cols).not.toContain('sdContactId');
  });
});
