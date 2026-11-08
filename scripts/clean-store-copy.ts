import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { db } from '../server/db.js';

// Remove internal photo-identification notes, preserving product facts.
const clean = (text: string) => text
  .replace(/Название указано так, как на флаконе\.?/g, '')
  .replace(/(?:На фото|На фотографии)[^.]*\./g, '')
  .replace(/;[^.!?]*(?:можно уточнить у магазина|уточните перед заказом)[.!?]?/g, '.')
  .replace(/[^.!?]*(?:можно уточнить у магазина|уточните перед заказом)[.!?]?/g, '')
  .replace(/Переключите фото[^.]*\./g, '')
  .replace(/ — выберите нужный слайдом\./g, '.')
  .replace(/; на фото[^.]*\./g, '.')
  .replace(/\s+/g, ' ').trim();

const apply = process.argv.includes('--apply');
try {
  const products = await db.product.findMany();
  const changes = products.map((p) => ({ id: p.id, name: p.name, before: p.description, after: clean(p.description), updatedAt: p.updatedAt })).filter((p) => p.after && p.before !== p.after);
  await mkdir('work/backups', { recursive: true });
  await writeFile(`work/backups/store-copy-${Date.now()}.json`, JSON.stringify(changes, null, 2), { flag: 'wx' });
  if (apply) await db.$transaction(async (tx) => {
    for (const p of changes) {
      const result = await tx.product.updateMany({ where: { id: p.id, updatedAt: p.updatedAt, description: p.before }, data: { description: p.after } });
      if (result.count !== 1) throw new Error('Product changed while cleaning copy; cancelled');
    }
    if (changes.length) await tx.audit.create({ data: { action: 'catalog.customer-copy.clean' } });
  });
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', changes: changes.map(({ name, before, after }) => ({ name, before, after })) }, null, 2));
  // Keep the reviewed import texts free of the same internal notes.
  if (apply) {
    const file = 'assets-source/catalog-import-20261108/products.json';
    const entries = JSON.parse(await readFile(file, 'utf8')) as { description: string }[];
    await writeFile(file, JSON.stringify(entries.map((entry) => ({ ...entry, description: clean(entry.description) })), null, 2) + '\n');
  }
} finally { await db.$disconnect(); }
