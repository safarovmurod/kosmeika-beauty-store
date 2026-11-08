import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Product, Variant } from '../shared/schema';
import { productSchema } from '../shared/schema';
import { availability } from '../shared/availability';
import { chatLink, orderMessage, productLink } from '../client/whatsapp';

const first: Variant = { id: 'pink', name: 'Розовый', color: '#ffbbcc', sku: 'SKU-1', available: true, price: null, images: ['/images/pink.webp'] };
const second: Variant = { ...first, id: 'red', name: 'Красный', sku: 'SKU-2', price: 12500, images: ['/images/red.webp', '/images/red-back.webp'] };
const product: Product = { id: 'product-1', name: 'Товар & уход', description: '', usage: '', ingredients: '', volume: '', categoryId: 'category', price: 10000, salePrice: 9000, available: true, visible: true, isNew: false, recommended: false, position: 0, variants: [first, second], createdAt: '2026-11-08', category: { id: 'category', name: 'Уход' } };

test('the file caption contains only product, chosen variant, price and literal customer text', () => {
  const note = 'Доставка? & цвет красный\n2 штуки + подарок 🎁';
  const message = orderMessage(product, second, note);
  assert.equal(message, `Товар & уход\nКрасный\n125 сомони\n\n${note}`);
  for (const unwanted of ['Здравствуйте', 'уточнить', 'Артикул', 'SKU-2', 'Карточка:', 'Фото:', 'Моё сообщение:', 'http', 'Количество:']) assert.ok(!message.includes(unwanted), unwanted);
});

test('unknown price adds no invented price, stock enquiry or default variant label', () => {
  const variant = { ...first, name: 'Как на фото', price: null, available: null };
  const unset = { ...product, price: null, salePrice: null, available: null, variants: [variant] };
  assert.equal(orderMessage(unset, variant), product.name);
  assert.equal(orderMessage(unset, variant, 'салом'), `${product.name}\n\nсалом`);
});

test('opening the chat leaves its composer blank until the customer writes', () => {
  assert.equal(chatLink(), 'https://wa.me/992906480008');
  assert.equal(chatLink('   '), 'https://wa.me/992906480008');
  const note = 'Салом! 2 дона & доставка?';
  const link = new URL(chatLink(note));
  assert.equal(link.searchParams.get('text'), note);
  assert.deepEqual([...link.searchParams.keys()], ['text']);
});

test('empty price and availability remain distinct from zero and out of stock', () => {
  const unset = { ...product, price: null, salePrice: null, available: null, variants: [{ ...first, available: null }] };
  assert.ok(productSchema.safeParse(unset).success);
  assert.equal(availability(unset, unset.variants[0]), null);
  assert.equal(availability({ available: true }, unset.variants[0]), true);
  assert.equal(availability({ available: false }, first), false);
  assert.equal(availability(product, { ...first, available: false }), false);
  assert.ok(!productSchema.safeParse({ ...unset, salePrice: 100 }).success);
});

test('selected photo deep links retain a real image index, without adding arbitrary URLs', () => {
  const origin = 'https://store.example';
  const link = new URL(productLink(product, second, origin, second.images[1]));
  assert.equal(link.searchParams.get('variant'), 'red');
  assert.equal(link.searchParams.get('photo'), '1');
  const invalid = new URL(productLink(product, second, origin, 'https://attacker.example/image.png'));
  assert.equal(invalid.searchParams.has('photo'), false);
});
