import { and, eq } from 'drizzle-orm';
import type { Category, Product, ProductInput } from '@tma-shop/shared';
import type { Database } from '../db/client.js';
import { categories, orderItems, products } from '../db/schema.js';
import { toCategoryDTO, toProductDTO } from '../db/mappers.js';
import { ApiError } from '../lib/errors.js';

export async function createProduct(
  db: Database,
  shopId: string,
  input: ProductInput,
): Promise<Product> {
  const [row] = await db
    .insert(products)
    .values({ shopId, ...input })
    .returning();
  if (!row) throw new Error('Failed to create product');
  return toProductDTO(row);
}

export async function updateProduct(
  db: Database,
  shopId: string,
  productId: string,
  input: ProductInput,
): Promise<Product> {
  const [row] = await db
    .update(products)
    .set({ ...input })
    .where(and(eq(products.shopId, shopId), eq(products.id, productId)))
    .returning();
  if (!row) throw ApiError.notFound('Product not found');
  return toProductDTO(row);
}

/**
 * Removes a product from the shop. Products that already appear in an order
 * cannot be hard-deleted (order history keeps a reference to them), so those
 * are archived instead: hidden from the catalog and no longer purchasable.
 */
export async function deleteProduct(
  db: Database,
  shopId: string,
  productId: string,
): Promise<{ archived: boolean }> {
  const where = and(eq(products.shopId, shopId), eq(products.id, productId));
  const product = await db.query.products.findFirst({ where });
  if (!product) throw ApiError.notFound('Product not found');

  const ordered = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.productId, productId))
    .limit(1);

  if (ordered.length > 0) {
    await db.update(products).set({ isActive: false }).where(where);
    return { archived: true };
  }

  await db.delete(products).where(where);
  return { archived: false };
}

export async function createCategory(
  db: Database,
  shopId: string,
  input: { slug: string; title: string; sortOrder: number },
): Promise<Category> {
  const [row] = await db
    .insert(categories)
    .values({ shopId, ...input })
    .returning();
  if (!row) throw new Error('Failed to create category');
  return toCategoryDTO(row);
}
