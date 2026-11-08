import { db } from './db.js';
import { readFile } from 'node:fs/promises';

// Explicitly opt in to demo records; never overwrite store data.
if (await db.product.count()) throw new Error('Каталог не пуст: демонстрационные данные не добавлены.');
const category = await db.category.upsert({ where: { name: 'Демонстрация' }, update: {}, create: { name: 'Демонстрация' } });
const photos = JSON.parse(await readFile('assets-source/catalog-import-20261108/manifest.json', 'utf8')) as { key: string; imageId: string; file: string; thumbnail: string; url: string }[];
const replacements = JSON.parse(await readFile('assets-source/catalog-import-20261108/products.json', 'utf8')) as { existingNumber?: number; variants: { photo: string }[] }[];
for (const photo of photos) await db.image.upsert({ where: { id: photo.imageId }, update: {}, create: { id: photo.imageId, content: await readFile(photo.file), thumbnail: await readFile(photo.thumbnail) } });
for (let i = 1; i <= 28; i++) {
  const number = String(i).padStart(3, '0');
  const key = i === 26 ? 'restored-026' : replacements.find((p) => p.existingNumber === i)?.variants[0].photo;
  const photo = photos.find((p) => p.key === key);
  await db.product.create({ data: { name: `Демонстрационный товар ${i}`, categoryId: category.id, price: null, visible: true, available: null, position: i, description: 'Демонстрационная карточка. Название, цена и наличие требуют уточнения у владельца.', variants: [{ id: `demo-${number}`, name: 'Без оттенка', color: '#d3ada7', sku: '', available: null, price: null, images: [photo?.url || `/images/products/product_${number}-v3.webp`] }] } });
}
await db.$disconnect();
