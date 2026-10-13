import type {
  Category,
  Order,
  OrderItem,
  Product,
  SessionUser,
  ShopAdminView,
  ShopConfig,
  ShopSummary,
} from '@tma-shop/shared';
import type { categories, orderItems, orders, products, shops, users } from './schema.js';
import { expandWallets, explorerTxUrl } from '../config/payment-methods.js';

type ProductRow = typeof products.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type ShopRow = typeof shops.$inferSelect;
type UserRow = typeof users.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

export function toProductDTO(row: ProductRow): Product {
  return {
    id: row.id,
    shopId: row.shopId,
    categoryId: row.categoryId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    price: row.price,
    currency: row.currency,
    imageUrl: row.imageUrl,
    stock: row.stock,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCategoryDTO(row: CategoryRow): Category {
  return {
    id: row.id,
    shopId: row.shopId,
    slug: row.slug,
    title: row.title,
    sortOrder: row.sortOrder,
  };
}

export function toShopConfigDTO(row: ShopRow, canManage = false): ShopConfig {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    isVisible: row.isVisible,
    currency: row.currency,
    botUsername: row.botUsername,
    starsEnabled: row.starsEnabled,
    orderFee: row.orderFee,
    orderFeeLabel: row.orderFeeLabel,
    paymentMethods: expandWallets(row.wallets),
    canManage,
  };
}

export function toShopSummaryDTO(row: ShopRow, canManage: boolean): ShopSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    isVisible: row.isVisible,
    canManage,
  };
}

export function toShopAdminDTO(row: ShopRow): ShopAdminView {
  return {
    ...toShopConfigDTO(row, true),
    sortOrder: row.sortOrder,
    adminIds: row.adminIds,
    wallets: row.wallets,
  };
}

export function toSessionUserDTO(row: UserRow): SessionUser {
  return {
    telegramId: row.telegramId,
    firstName: row.firstName,
    lastName: row.lastName,
    username: row.username,
    languageCode: row.languageCode,
    isPremium: row.isPremium,
    photoUrl: row.photoUrl,
    role: row.role,
  };
}

export function toOrderItemDTO(row: OrderItemRow): OrderItem {
  return {
    productId: row.productId,
    title: row.title,
    unitPrice: row.unitPrice,
    quantity: row.quantity,
    subtotal: row.subtotal,
  };
}

export function toOrderDTO(row: OrderRow, items: OrderItemRow[]): Order {
  return {
    id: row.id,
    shopId: row.shopId,
    userId: row.userId,
    status: row.status,
    items: items.map(toOrderItemDTO),
    total: row.total,
    fee: row.fee,
    currency: row.currency,
    paymentChargeId: row.paymentChargeId,
    paymentNetwork: row.paymentNetwork,
    paymentTxHash: row.paymentTxHash,
    paymentTxUrl: explorerTxUrl(row.paymentNetwork, row.paymentTxHash),
    contactUsername: row.contactUsername,
    amountPaid: row.amountPaid,
    amountDue: row.total - row.amountPaid,
    amountSubmitted: row.amountSubmitted,
    changeRequest: row.changeRequest ?? null,
    paymentLog: row.paymentLog,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
