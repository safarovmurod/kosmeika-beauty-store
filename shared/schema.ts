import { z } from 'zod';

export const variantSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().min(1).max(100), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sku: z.string().max(100), available: z.boolean().nullable(), price: z.number().int().min(0).nullable(),
  images: z.array(z.string().regex(/^\/(uploads|images)\/[a-zA-Z0-9_./-]+$/).refine((value) => !value.includes('..'))).max(10),
});
export const productSchema = z.object({
  name: z.string().min(1).max(150), description: z.string().max(5000), usage: z.string().max(3000),
  ingredients: z.string().max(5000), volume: z.string().max(100), categoryId: z.string().min(1),
  price: z.number().int().min(0).nullable(), salePrice: z.number().int().min(0).nullable(), available: z.boolean().nullable(),
  visible: z.boolean(), isNew: z.boolean(), recommended: z.boolean(), position: z.number().int(),
  variants: z.array(variantSchema).min(1).max(20),
}).refine((p) => p.salePrice === null || (p.price !== null && p.salePrice < p.price), { message: 'Акционная цена должна быть ниже обычной', path: ['salePrice'] })
  .refine((p) => new Set(p.variants.map((v) => v.id)).size === p.variants.length, {message:'ID оттенков должны быть уникальными', path:['variants']});
export type Variant = z.infer<typeof variantSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type Product = ProductInput & { id: string; createdAt: string; category: { id: string; name: string } };
export type Category = { id: string; name: string; position: number };
