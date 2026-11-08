import type { ProductInput, Variant } from './schema.js';

export function availability(product: Pick<ProductInput, 'available'>, variant: Variant): boolean | null {
  if (product.available === false || variant.available === false) return false;
  if (product.available === true || variant.available === true) return true;
  return null;
}
