import type { Product, Variant } from '../shared/schema';
import { money } from './api';

export const phone = '992906480008';

export function productLink(product: Product, variant: Variant, origin = location.origin) {
  const url = new URL('/', origin);
  url.searchParams.set('product', product.id);
  url.searchParams.set('variant', variant.id);
  return url.toString();
}

export function orderMessage(product: Product, variant: Variant, note = '', photo = variant.images[0], origin = location.origin) {
  const price = variant.price ?? product.salePrice ?? product.price;
  const available = product.available && variant.available;
  return [
    available && price > 0 ? 'Здравствуйте! Хочу заказать:' : 'Здравствуйте! Хочу уточнить цену и наличие:',
    '',
    `Товар: ${product.name}`,
    `Артикул: ${variant.sku || product.id}`,
    `Вариант: ${variant.name}`,
    `Цена: ${price > 0 ? money(price) : 'уточнить'}`,
    ...(photo ? [`Фото: ${new URL(photo, origin).href}`] : []),
    `Товар: ${productLink(product, variant, origin)}`,
    ...(note.trim() ? ['', `Моё сообщение: ${note.trim()}`] : []),
  ].join('\n');
}

export function orderLink(product: Product, variant: Variant, note = '', photo = variant.images[0], origin = location.origin) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(orderMessage(product, variant, note, photo, origin))}`;
}
