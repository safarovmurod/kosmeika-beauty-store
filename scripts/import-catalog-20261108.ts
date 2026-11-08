import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { productSchema, type ProductInput } from '../shared/schema.js';

const apply = process.argv.includes('--apply');
const preview = process.argv.includes('--preview');
if (apply && preview) throw new Error('Choose apply or preview');
const action = 'catalog.import.20261108';
const root = 'assets-source/catalog-import-20261108';
type Photo = { key: string; imageId: string; file: string; thumbnail: string; url: string };
type Entry = { existingNumber?: number; newId?: string; category?: string; name: string; description: string; usage?: string; volume: string; variants: { id: string; name: string; color: string; photo: string; sku: string }[] };
const photos = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as Photo[];
const entries = JSON.parse(await readFile(`${root}/products.json`, 'utf8')) as Entry[];
const { db } = preview ? { db: null } : await import('../server/db.js');
try {
  if (db && await db.audit.findFirst({ where: { action } })) {
    console.log(JSON.stringify({ status: 'already-applied', message: 'Owner changes preserved; import will not reset them again.' }));
  } else {
    const snapshot = preview ? JSON.parse(await readFile('work/catalog-import-20261108/catalog-before.json', 'utf8')) : null;
    const products = db ? await db.product.findMany() : snapshot.products;
    const categories: { id: string; name: string }[] = db ? await db.category.findMany() : snapshot.categories;
    const plan: { id: string; data: ProductInput; updatedAt?: Date }[] = products.map((product: { id: string; updatedAt?: Date }) => {
      const data = productSchema.parse(product);
      return { id: product.id, updatedAt: product.updatedAt, data: { ...data, price: null, salePrice: null, available: null, variants: data.variants.map((v) => ({ ...v, price: null, available: null, sku: v.sku || `KSM-${v.id.replace('demo-', '')}` })) } };
    });
    for (const entry of entries) {
      const oldId = `demo-${String(entry.existingNumber).padStart(3, '0')}`;
      const existing = entry.existingNumber ? plan.find((p) => p.data.variants.some((v) => v.id === oldId)) : undefined;
      if (entry.existingNumber && (!existing || existing.data.variants.length !== 1)) throw new Error(`Product ${entry.existingNumber} changed; review matching before import`);
      const categoryId = existing?.data.categoryId || categories.find((c) => c.name === entry.category)?.id;
      if (!categoryId) throw new Error(`Missing category ${entry.category}`);
      const variants = entry.variants.map((v) => {
        const photo = photos.find((p) => p.key === v.photo);
        if (!photo) throw new Error(`Missing photo ${v.photo}`);
        return { id: v.id, name: v.name, color: v.color, sku: v.sku, available: null, price: null, images: [photo.url] };
      });
      const data = productSchema.parse({ price: null, salePrice: null, available: null, ingredients: '', visible: true, isNew: false, recommended: false, position: Math.max(...plan.map((p) => p.data.position), 0) + 1, ...existing?.data, name: entry.name, description: entry.description, usage: entry.usage || '', volume: entry.volume, categoryId, variants });
      if (existing) existing.data = data;
      else {
        if (!entry.newId || plan.some((p) => p.id === entry.newId)) throw new Error('Duplicate new product');
        plan.push({ id: entry.newId, data });
      }
    }
    for (const number of [26]) {
      const variantId = `demo-${String(number).padStart(3, '0')}`;
      const product = plan.find((p) => p.data.variants.some((v) => v.id === variantId));
      const photo = photos.find((p) => p.key === `restored-${String(number).padStart(3, '0')}`);
      if (!product || !photo) throw new Error(`Missing original ${number}`);
      product.data.variants = product.data.variants.map((v) => v.id === variantId ? { ...v, images: [photo.url] } : v);
    }
    const ids = plan.flatMap((p) => p.data.variants.map((v) => v.id));
    const skus = plan.flatMap((p) => p.data.variants.map((v) => v.sku));
    if (new Set(ids).size !== ids.length || new Set(skus).size !== skus.length) throw new Error('Duplicate variant IDs or SKUs');
    const prepared = await Promise.all(photos.map(async (p) => ({ ...p, content: await readFile(p.file), thumbnail: await readFile(p.thumbnail) })));
    if (preview) {
      const catalog = { ...snapshot, products: plan.map((p) => ({ ...p.data, id: p.id, createdAt: products.find((v: { id: string }) => v.id === p.id)?.createdAt || new Date().toISOString(), category: categories.find((c) => c.id === p.data.categoryId) })) };
      await writeFile('work/catalog-import-20261108/catalog-preview.json', JSON.stringify(catalog, null, 2));
    }
    if (apply && db) {
      await mkdir('work/backups', { recursive: true });
      await writeFile(`work/backups/catalog-before-import-${Date.now()}.json`, JSON.stringify(products, null, 2), { flag: 'wx' });
      await db.$transaction(async (tx) => {
        for (const p of prepared) {
          const existing = await tx.image.findUnique({ where: { id: p.imageId } });
          if (existing) {
            if (createHash('sha256').update(existing.content).digest('hex') !== createHash('sha256').update(p.content).digest('hex')) throw new Error('Image ID conflict');
          } else await tx.image.create({ data: { id: p.imageId, content: p.content, thumbnail: p.thumbnail } });
        }
        for (const p of plan) {
          if (p.updatedAt) {
            const changed = await tx.product.updateMany({ where: { id: p.id, updatedAt: p.updatedAt }, data: p.data });
            if (changed.count !== 1) throw new Error('Product changed during import; transaction cancelled');
          } else await tx.product.create({ data: { id: p.id, ...p.data } });
        }
        await tx.audit.create({ data: { action } });
      }, { timeout: 120000 });
    }
    console.log(JSON.stringify({ mode: apply ? 'applied' : preview ? 'preview' : 'dry-run', products: plan.length, replaced: entries.filter((e) => e.existingNumber).length, added: entries.filter((e) => e.newId).length, restored: 1, photos: prepared.length, variants: ids.length }));
  }
} finally { await db?.$disconnect(); }
