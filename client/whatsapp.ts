import type { Product, Variant } from '../shared/schema';
import { availability } from '../shared/availability';
import { money } from './api';

export const phone = '992906480008';

export function productLink(product: Product, variant: Variant, origin = location.origin, photo = variant.images[0]) {
  const url = new URL('/', origin);
  url.searchParams.set('product', product.id);
  url.searchParams.set('variant', variant.id);
  const index = photo ? variant.images.indexOf(photo) : -1;
  if (index > 0) url.searchParams.set('photo', String(index));
  return url.toString();
}

export function orderMessage(product: Product, variant: Variant, note = '', photo = variant.images[0], origin = location.origin) {
  const price = variant.price ?? product.salePrice ?? product.price;
  const available = availability(product, variant);
  return [
    available && price !== null && price > 0 ? 'Здравствуйте! Хочу заказать:' : 'Здравствуйте! Хочу уточнить цену и наличие:',
    '',
    `Товар: ${product.name}`,
    `Артикул: ${variant.sku || variant.id}`,
    `Вариант: ${variant.name}`,
    `Цена: ${price !== null && price > 0 ? money(price) : 'уточнить'}`,
    `Карточка: ${productLink(product, variant, origin, photo)}`,
    ...(photo ? [`Фото: ${new URL(photo, origin).href}`] : []),
    ...(note.trim() ? ['', `Моё сообщение: ${note.trim()}`] : []),
  ].join('\n');
}

export function orderLink(product: Product, variant: Variant, note = '', photo = variant.images[0], origin = location.origin) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(orderMessage(product, variant, note, photo, origin))}`;
}
