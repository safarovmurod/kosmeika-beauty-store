import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { db } from '../server/db.js';
import { variantSchema } from '../shared/schema.js';

const entries = z.array(z.object({ number: z.number().int().min(1).max(28), name: z.string().min(1).max(150), category: z.string(), description: z.string().max(5000), volume: z.string().max(100).optional(), image: z.string().regex(/^product_\d{3}-v\d+$/).optional() })).length(28).refine((items) => new Set(items.map((item) => item.number)).size === 28).parse(JSON.parse(await readFile('scripts/catalog-content.json', 'utf8')));
const apply = process.argv.includes('--apply');
try {
  const products = await db.product.findMany({ orderBy: { position: 'asc' } });
  await mkdir('work/backups', { recursive: true });
  await writeFile(`work/backups/catalog-${Date.now()}.json`, JSON.stringify(products, null, 2), { flag: 'wx' });
  let updated = 0; let skipped = 0;
  await db.$transaction(async (tx) => {
    for (const entry of entries) {
      const number = String(entry.number).padStart(3, '0');
      const product = products.find((item) => item.name === `Демонстрационный товар ${entry.number}`);
      if (!product) { skipped++; continue; }
      const parsed = z.array(variantSchema).safeParse(product.variants);
      const expectedImages = [`/images/products/product_${number}.webp`, `/images/products/product_${number}-v3.webp`];
      const pendingPhoto = [2,26].includes(entry.number);
      if (!parsed.success || parsed.data.length !== 1 || parsed.data[0].id !== `demo-${number}` || !((parsed.data[0].images.length === 1 && expectedImages.includes(parsed.data[0].images[0])) || (pendingPhoto && parsed.data[0].images.length === 0))) { skipped++; continue; }
      if (!apply) { updated++; continue; }
      const category = await tx.category.upsert({ where: { name: entry.category }, create: { name: entry.category }, update: {} });
      const variants = parsed.data.map((variant) => ({ ...variant, name: variant.name === 'Без оттенка' ? 'Как на фото' : variant.name, images: pendingPhoto ? [] : entry.image ? [`/images/products/${entry.image}.webp`] : variant.images }));
      // Guard against concurrent owner edits; prices, availability and IDs stay intact.
      const result = await tx.product.updateMany({ where: { id: product.id, name: product.name, updatedAt: product.updatedAt }, data: { name: entry.name, description: entry.description, volume: product.volume || entry.volume || '', categoryId: category.id, variants } });
      if (result.count) updated++; else skipped++;
    }
  }, { timeout: 30000 });
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', updated, skipped }));
} finally { await db.$disconnect(); }
