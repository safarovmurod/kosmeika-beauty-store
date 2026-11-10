import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { productSchema } from '../shared/schema.js';
import { db } from '../server/db.js';

const apply = process.argv.includes('--apply');
const root = 'assets-source/catalog-import-20261110';
const action = 'catalog.import.20261110';
type Photo = { key: string; imageId: string; file: string; thumbnail: string; url: string };
type Entry = { slug: string; sku: string; category: string; name: string; description: string; volume: string; photos: string[]; color: string; options?: { suffix: string; name: string; color: string }[] };
const photos = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as Photo[];
const entries = JSON.parse(await readFile(`${root}/products.json`, 'utf8')) as Entry[];
const photo = (key: string) => { const found = photos.find((p) => p.key === key); if (!found) throw new Error(`Missing photo ${key}`); return found.url; };
try {
  if (await db.audit.findFirst({ where: { action } })) {
    console.log(JSON.stringify({ status: 'already-applied' }));
  } else {
    const products = await db.product.findMany();
    const categories = await db.category.findMany();
    const before = JSON.parse(await readFile('work/catalog-import-20261110/catalog-before.json', 'utf8'));
    const matched = products.find((p) => productSchema.parse(p).variants.some((v) => v.id === 'demo-005'));
    const expected = before.products.find((p: { id: string }) => p.id === matched?.id);
    if (!matched || !expected || new Date(expected.updatedAt).getTime() !== matched.updatedAt.getTime()) throw new Error('TRICHUP changed since review; import cancelled');
    const shampoo = productSchema.parse(matched);
    if (shampoo.variants.some((v) => v.id === 'trichup-black-seed-400')) throw new Error('Black Seed already exists; review duplicate');
    const update = productSchema.parse({ ...shampoo,
      name: 'Trichup — шампунь с кондиционером',
      description: 'Шампунь Trichup для очищения волос и кожи головы. Два варианта по 400 мл: Healthy, Long & Strong и Black Seed. Выберите нужную формулу перед заказом.',
      volume: '400 мл',
      variants: [
        ...shampoo.variants.map((v) => v.id === 'demo-005' ? { ...v, name: 'Healthy, Long & Strong', images: [photo('trichup-healthy')] } : v),
        { id: 'trichup-black-seed-400', sku: 'KSM-005-BS', name: 'Black Seed', color: '#228f35', price: null, available: null, images: [photo('35-shampoo')] },
      ],
    });
    const maximum = Math.max(0, ...products.map((p) => p.position));
    const additions = entries.map((entry, index) => {
      const id = `catalog-20261110-${entry.slug}`;
      if (products.some((p) => p.id === id)) throw new Error(`Duplicate product ${id}`);
      const category = categories.find((c) => c.name === entry.category);
      if (!category) throw new Error(`Missing category ${entry.category}`);
      const options = entry.options || [{ suffix: '', name: 'Как на фото', color: entry.color }];
      const data = productSchema.parse({ name: entry.name, description: entry.description, usage: '', ingredients: '', volume: entry.volume,
        categoryId: category.id, price: null, salePrice: null, available: null, visible: true, isNew: false, recommended: false, position: maximum + index + 1,
        variants: options.map((option) => ({ id: `${entry.slug}${option.suffix ? `-${option.suffix.toLowerCase()}` : ''}`, sku: `${entry.sku}${option.suffix ? `-${option.suffix}` : ''}`, name: option.name, color: option.color, price: null, available: null, images: entry.photos.map(photo) })),
      });
      return { id, data };
    });
    const all = [...products.filter((p) => p.id !== matched.id).map((p) => productSchema.parse(p)), update, ...additions.map((p) => p.data)];
    const variants = all.flatMap((p) => p.variants);
    if (new Set(variants.map((v) => v.id)).size !== variants.length || new Set(variants.map((v) => v.sku)).size !== variants.length) throw new Error('Duplicate variant ID or SKU');
    const images = await Promise.all(photos.map(async (p) => ({ ...p, content: await readFile(p.file), thumbnail: await readFile(p.thumbnail) })));
    await mkdir('work/catalog-import-20261110', { recursive: true });
    await writeFile('work/catalog-import-20261110/import-plan.json', JSON.stringify({ updated: { id: matched.id, data: update }, additions }, null, 2));
    if (apply) {
      await mkdir('work/backups', { recursive: true });
      await writeFile(`work/backups/catalog-before-20261110-${Date.now()}.json`, JSON.stringify({ products, categories }, null, 2), { flag: 'wx' });
      await db.$transaction(async (tx) => {
        for (const image of images) {
          const existing = await tx.image.findUnique({ where: { id: image.imageId } });
          if (existing) {
            if (createHash('sha256').update(existing.content).digest('hex') !== createHash('sha256').update(image.content).digest('hex')) throw new Error('Image ID conflict');
          } else await tx.image.create({ data: { id: image.imageId, content: image.content, thumbnail: image.thumbnail } });
        }
        const changed = await tx.product.updateMany({ where: { id: matched.id, updatedAt: matched.updatedAt }, data: update });
        if (changed.count !== 1) throw new Error('TRICHUP changed during import; transaction cancelled');
        for (const addition of additions) await tx.product.create({ data: { id: addition.id, ...addition.data } });
        await tx.audit.create({ data: { action } });
      }, { timeout: 120000 });
    }
    console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', added: additions.length, updated: 1, products: all.length, variants: variants.length, photos: images.length }));
  }
} finally { await db.$disconnect(); }
