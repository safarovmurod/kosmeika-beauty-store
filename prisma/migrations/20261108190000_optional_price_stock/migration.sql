-- An empty value is distinct from a free item or an out-of-stock item.
ALTER TABLE "Product" ALTER COLUMN "price" DROP NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "available" DROP NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "available" DROP DEFAULT;
