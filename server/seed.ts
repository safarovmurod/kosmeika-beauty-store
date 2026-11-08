import { db } from './db.js';

// Explicitly opt in to demo records; never overwrite store data.
if (await db.product.count()) throw new Error('Каталог не пуст: демонстрационные данные не добавлены.');
const category = await db.category.upsert({ where: { name: 'Демонстрация' }, update: {}, create: { name: 'Демонстрация' } });
for (let i = 1; i <= 28; i++) {
  const number = String(i).padStart(3, '0');
  await db.product.create({ data: { name: `Демонстрационный товар ${i}`, categoryId: category.id, price: 0, visible: true, available: false, position: i, description: 'Демонстрационная карточка. Название, цена и наличие требуют уточнения у владельца.', variants: [{ id: `demo-${number}`, name: 'Без оттенка', color: '#d3ada7', sku: '', available: false, price: null, images: [2,26].includes(i) ? [] : [`/images/products/product_${number}-v3.webp`] }] } });
}
await db.$disconnect();
