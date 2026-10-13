import type {
  AuthResponse,
  Cart,
  CatalogQuery,
  Category,
  CreateOrderResponse,
  ExportRequest,
  ExportResponse,
  InvoiceResponse,
  Order,
  PlatformShopInput,
  Product,
  ProductInput,
  ShopAdminView,
  ShopConfig,
  ShopProfileInput,
  ShippingZone,
  ShopSummary,
  WalletInput,
} from '@tma-shop/shared';

export interface ShopsResponse {
  shops: ShopSummary[];
  isSuperAdmin: boolean;
}

export interface ProductPage {
  items: Product[];
  page: number;
  limit: number;
  total: number;
}

export interface CategoryInput {
  slug: string;
  title: string;
  sortOrder: number;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiClient {
  private token: string | null = null;
  private shop: string | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  /** Shop (id or slug) that shop-scoped calls — catalog, cart, orders, admin — apply to. */
  setShop(shop: string | null): void {
    this.shop = shop;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    if (this.shop) headers.set('X-Shop', this.shop);

    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
    if (res.status === 204) return undefined as T;

    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiClientError(res.status, err?.code ?? 'error', err?.message ?? res.statusText);
    }
    return data as T;
  }

  // --- auth ---
  auth(initData: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    });
  }

  // --- shops & platform ---
  getShops(): Promise<ShopsResponse> {
    return this.request<ShopsResponse>('/shops');
  }

  platformGetShops(): Promise<ShopAdminView[]> {
    return this.request<ShopAdminView[]>('/platform/shops');
  }

  platformCreateShop(input: PlatformShopInput): Promise<ShopAdminView> {
    return this.request<ShopAdminView>('/platform/shops', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  platformUpdateShop(shopId: string, input: PlatformShopInput): Promise<ShopAdminView> {
    return this.request<ShopAdminView>(`/platform/shops/${shopId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  platformDeleteShop(shopId: string): Promise<void> {
    return this.request<void>(`/platform/shops/${shopId}`, { method: 'DELETE' });
  }

  // --- catalog ---
  getShop(): Promise<ShopConfig> {
    return this.request<ShopConfig>('/shop');
  }

  getCategories(): Promise<Category[]> {
    return this.request<Category[]>('/categories');
  }

  getProducts(query: Partial<CatalogQuery> = {}): Promise<ProductPage> {
    const params = new URLSearchParams();
    if (query.categoryId) params.set('categoryId', query.categoryId);
    if (query.search) params.set('search', query.search);
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return this.request<ProductPage>(`/products${qs ? `?${qs}` : ''}`);
  }

  getProduct(id: string): Promise<Product> {
    return this.request<Product>(`/products/${id}`);
  }

  // --- cart ---
  getCart(): Promise<Cart> {
    return this.request<Cart>('/cart');
  }

  /** `variantId` is required for products with options. */
  addToCart(productId: string, variantId: string | null, quantity: number): Promise<Cart> {
    return this.request<Cart>('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, variantId, quantity }),
    });
  }

  /** `lineId` is the cart line's `id`. */
  setCartItem(lineId: string, quantity: number): Promise<Cart> {
    return this.request<Cart>(`/cart/items/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  }

  removeCartItem(lineId: string): Promise<Cart> {
    return this.request<Cart>(`/cart/items/${lineId}`, { method: 'DELETE' });
  }

  // --- orders & payment ---
  /**
   * Creates an order from the cart; `contactUsername` is the customer's Telegram @.
   * Shops with shipping also need the zone and the encrypted address.
   */
  createOrder(
    contactUsername: string,
    shipping: { shippingZoneId: string; encryptedAddress: string } | null = null,
  ): Promise<CreateOrderResponse> {
    return this.request<CreateOrderResponse>('/orders', {
      method: 'POST',
      body: JSON.stringify({ contactUsername, ...(shipping ?? {}) }),
    });
  }

  getOrders(): Promise<Order[]> {
    return this.request<Order[]>('/orders');
  }

  getOrder(id: string): Promise<Order> {
    return this.request<Order>(`/orders/${id}`);
  }

  /** Deletes one of the caller's orders (only unpaid or cancelled ones). */
  deleteOrder(orderId: string): Promise<void> {
    return this.request<void>(`/orders/${orderId}`, { method: 'DELETE' });
  }

  createInvoice(orderId: string): Promise<InvoiceResponse> {
    return this.request<InvoiceResponse>(`/orders/${orderId}/invoice`, { method: 'POST' });
  }

  /** Reports a crypto payment (chosen wallet + tx hash) for manual verification. */
  submitPayment(orderId: string, methodId: string, txHash: string): Promise<Order> {
    return this.request<Order>(`/orders/${orderId}/payment`, {
      method: 'POST',
      body: JSON.stringify({ methodId, txHash }),
    });
  }

  /** Asks the shop to change a paid order to these lines (needs admin approval). */
  requestOrderChange(
    orderId: string,
    items: Array<{ productId: string; variantId: string | null; quantity: number }>,
  ): Promise<Order> {
    return this.request<Order>(`/orders/${orderId}/change`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  withdrawOrderChange(orderId: string): Promise<Order> {
    return this.request<Order>(`/orders/${orderId}/change`, { method: 'DELETE' });
  }

  // --- admin ---
  /** Sets the fixed fee added once to each new order (0 = none) and its label. */
  adminGetShop(): Promise<ShopAdminView> {
    return this.request<ShopAdminView>('/admin/shop');
  }

  adminUpdateProfile(input: ShopProfileInput): Promise<ShopAdminView> {
    return this.request<ShopAdminView>('/admin/shop/profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  adminUpdateWallets(wallets: WalletInput[]): Promise<ShopAdminView> {
    return this.request<ShopAdminView>('/admin/shop/wallets', {
      method: 'PUT',
      body: JSON.stringify({ wallets }),
    });
  }

  adminUpdateShipping(zones: Array<Omit<ShippingZone, 'id'> & { id?: string }>): Promise<ShopAdminView> {
    return this.request<ShopAdminView>('/admin/shop/shipping', {
      method: 'PUT',
      body: JSON.stringify({ zones }),
    });
  }

  /** Sets the shop's address public key (base64 SPKI), or removes it with null. */
  adminUpdateAddressKey(publicKey: string | null): Promise<ShopAdminView> {
    return this.request<ShopAdminView>('/admin/shop/address-key', {
      method: 'PUT',
      body: JSON.stringify({ publicKey }),
    });
  }

  adminUpdateOrderFee(orderFee: number, orderFeeLabel: string): Promise<ShopAdminView> {
    return this.request<ShopAdminView>('/admin/shop/fee', {
      method: 'PUT',
      body: JSON.stringify({ orderFee, orderFeeLabel }),
    });
  }

  adminApproveChange(orderId: string): Promise<Order> {
    return this.request<Order>(`/admin/orders/${orderId}/change/approve`, { method: 'POST' });
  }

  adminRejectChange(orderId: string): Promise<Order> {
    return this.request<Order>(`/admin/orders/${orderId}/change/reject`, { method: 'POST' });
  }

  /** Records that the overpaid difference was sent back to the customer. */
  adminRecordRefund(orderId: string): Promise<Order> {
    return this.request<Order>(`/admin/orders/${orderId}/refund`, { method: 'POST' });
  }

  adminGetOrders(): Promise<Order[]> {
    return this.request<Order[]>('/admin/orders');
  }

  adminCreateCategory(input: CategoryInput): Promise<Category> {
    return this.request<Category>('/admin/categories', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  adminUpdateCategory(categoryId: string, input: CategoryInput): Promise<Category> {
    return this.request<Category>(`/admin/categories/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  /** Deletes a category; its products stay, without a category. */
  adminDeleteCategory(categoryId: string): Promise<void> {
    return this.request<void>(`/admin/categories/${categoryId}`, { method: 'DELETE' });
  }

  /** The bot sends the report file to the admin's own Telegram chat. */
  adminExport(request: ExportRequest): Promise<ExportResponse> {
    return this.request<ExportResponse>('/admin/export', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  adminGetOrder(orderId: string): Promise<Order> {
    return this.request<Order>(`/admin/orders/${orderId}`);
  }

  adminDeleteOrder(orderId: string): Promise<void> {
    return this.request<void>(`/admin/orders/${orderId}`, { method: 'DELETE' });
  }

  /** All products, hidden ones included. */
  adminGetProducts(): Promise<Product[]> {
    return this.request<Product[]>('/admin/products');
  }

  adminUpdateProduct(productId: string, input: ProductInput): Promise<Product> {
    return this.request<Product>(`/admin/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  adminSetOrderStatus(orderId: string, status: Order['status']): Promise<Order> {
    return this.request<Order>(`/admin/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  /** Deletes a product, or archives it when it already appears in an order. */
  adminDeleteProduct(productId: string): Promise<void> {
    return this.request<void>(`/admin/products/${productId}`, { method: 'DELETE' });
  }

  adminCreateProduct(input: ProductInput): Promise<Product> {
    return this.request<Product>('/admin/products', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

export const api = new ApiClient();
