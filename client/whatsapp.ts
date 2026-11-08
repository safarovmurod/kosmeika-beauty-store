import type { Product, Variant } from '../shared/schema';
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

export function orderMessage(product: Product, variant: Variant, note = '') {
  const price = variant.price ?? product.salePrice ?? product.price;
  return [
    product.name,
    ...(product.variants.length > 1 ? [variant.name] : []),
    ...(price !== null ? [money(price)] : []),
    ...(note.trim() ? ['', note.trim()] : []),
  ].join('\n');
}

export function chatLink(note = '') {
  return `https://wa.me/${phone}${note.trim() ? `?text=${encodeURIComponent(note.trim())}` : ''}`;
}
