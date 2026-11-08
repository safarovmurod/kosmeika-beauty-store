import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Product, Variant } from '../shared/schema';
import { orderLink } from '../client/whatsapp';

const first: Variant = { id: 'pink', name: 'Розовый', color: '#ffbbcc', sku: 'SKU-1', available: true, price: null, images: ['/images/pink.webp'] };
const second: Variant = { ...first, id: 'red', name: 'Красный', sku: 'SKU-2', price: 12500, images: ['/images/red.webp', '/images/red-back.webp'] };
const product: Product = { id: 'product-1', name: 'Товар & уход', description: '', usage: '', ingredients: '', volume: '', categoryId: 'category', price: 10000, salePrice: 9000, available: true, visible: true, isNew: false, recommended: false, position: 0, variants: [first, second], createdAt: '2026-11-08', category: { id: 'category', name: 'Уход' } };
const origin = 'https://store.example';

test('WhatsApp receives the selected variant, gallery photo and literal customer text', () => {
  const note = 'Доставка? & цвет красный\n2 штуки + подарок 🎁';
  const url = new URL(orderLink(product, second, note, second.images[1], origin));
  assert.equal(url.origin + url.pathname, 'https://wa.me/992906480008');
  const message = url.searchParams.get('text')!;
  for (const text of ['Хочу заказать', 'Товар & уход', 'SKU-2', 'Красный', '125 сомони', `${origin}/images/red-back.webp`, '?product=product-1&variant=red', note]) assert.ok(message.includes(text), text);
  assert.ok(!message.includes('/images/pink.webp'));
  assert.ok(!message.includes('Количество: 1'), 'a fixed quantity must not contradict the customer asking for two');
  assert.equal([...url.searchParams.keys()].length, 1);
});

test('unknown prices and unavailable products can be enquired about without promising an order', () => {
  const message = new URL(orderLink({ ...product, price: 0, salePrice: null, available: false }, first, '', undefined, origin)).searchParams.get('text')!;
  assert.ok(message.includes('уточнить цену и наличие'));
  assert.ok(message.includes('Цена: уточнить'));
  assert.ok(!message.includes('0 сомони'));
  assert.ok(!message.includes('Моё сообщение:'));
});

test('sale price and missing photo produce a valid message without a broken photo link', () => {
  const message = new URL(orderLink(product, { ...first, images: [] }, '   ', undefined, origin)).searchParams.get('text')!;
  assert.ok(message.includes('90 сомони'));
  assert.ok(!message.includes('Фото:'));
  assert.ok(!message.includes('undefined'));
});
