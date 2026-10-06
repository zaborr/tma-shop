import { and, asc, eq, ne } from 'drizzle-orm';
import type { Category, Product, ProductInput } from '@tma-shop/shared';
import type { Database } from '../db/client.js';
import { categories, orderItems, products } from '../db/schema.js';
import { toCategoryDTO, toProductDTO } from '../db/mappers.js';
import { ApiError } from '../lib/errors.js';

/** Every product of the shop, hidden ones included (the catalog only shows active). */
export async function listAllProducts(db: Database, shopId: string): Promise<Product[]> {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.shopId, shopId))
    .orderBy(asc(products.createdAt));
  return rows.map(toProductDTO);
}

/** Rejects a slug already used by another product of the shop. */
async function assertProductSlugFree(
  db: Database,
  shopId: string,
  slug: string,
  exceptId?: string,
): Promise<void> {
  const filters = [eq(products.shopId, shopId), eq(products.slug, slug)];
  if (exceptId) filters.push(ne(products.id, exceptId));
  const taken = await db.query.products.findFirst({ where: and(...filters) });
  if (taken) {
    throw ApiError.conflict('slug_taken', `A product with the slug "${slug}" already exists`);
  }
}

export async function createProduct(
  db: Database,
  shopId: string,
  input: ProductInput,
): Promise<Product> {
  await assertProductSlugFree(db, shopId, input.slug);
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
  await assertProductSlugFree(db, shopId, input.slug, productId);
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

export interface CategoryInput {
  slug: string;
  title: string;
  sortOrder: number;
}

/** Rejects a slug already used by another category of the shop. */
async function assertCategorySlugFree(
  db: Database,
  shopId: string,
  slug: string,
  exceptId?: string,
): Promise<void> {
  const filters = [eq(categories.shopId, shopId), eq(categories.slug, slug)];
  if (exceptId) filters.push(ne(categories.id, exceptId));
  const taken = await db.query.categories.findFirst({ where: and(...filters) });
  if (taken) {
    throw ApiError.conflict('slug_taken', `A category with the slug "${slug}" already exists`);
  }
}

export async function createCategory(
  db: Database,
  shopId: string,
  input: CategoryInput,
): Promise<Category> {
  await assertCategorySlugFree(db, shopId, input.slug);
  const [row] = await db
    .insert(categories)
    .values({ shopId, ...input })
    .returning();
  if (!row) throw new Error('Failed to create category');
  return toCategoryDTO(row);
}

export async function updateCategory(
  db: Database,
  shopId: string,
  categoryId: string,
  input: CategoryInput,
): Promise<Category> {
  await assertCategorySlugFree(db, shopId, input.slug, categoryId);
  const [row] = await db
    .update(categories)
    .set({ ...input })
    .where(and(eq(categories.shopId, shopId), eq(categories.id, categoryId)))
    .returning();
  if (!row) throw ApiError.notFound('Category not found');
  return toCategoryDTO(row);
}

/** Deletes a category; its products stay in the shop without a category. */
export async function deleteCategory(
  db: Database,
  shopId: string,
  categoryId: string,
): Promise<void> {
  const deleted = await db
    .delete(categories)
    .where(and(eq(categories.shopId, shopId), eq(categories.id, categoryId)))
    .returning({ id: categories.id });
  if (deleted.length === 0) throw ApiError.notFound('Category not found');
}
