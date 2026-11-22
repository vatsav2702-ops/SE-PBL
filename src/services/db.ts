import {
  AppNotification,
  AppSettings,
  AuditLogEntry,
  Cancellation,
  CancellationItemSummary,
  CancellationStatus,
  CartItem,
  Order,
  OrderItem,
  OrderItemStatus,
  OrderStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Product,
  RefundStatus,
  User,
  UserRole,
} from '../types';
import {
  canCustomerEditAddress,
  canCustomerSoftDeleteOrder,
  DEFAULT_SETTINGS,
  evaluateCancellationEligibility,
  formatCurrency,
  getNextOrderStatus,
  STORAGE_KEYS,
} from '../rules/cancellationRules';
import { buildSeedDataset } from './seedData';

/**
 * Storage/Service Layer (db.ts)
 * ----------------------------------------------------------------------------
 * All UI components interact exclusively with these async functions so this
 * browser localStorage implementation can later be swapped for Firebase or a
 * REST backend without touching component code.
 */

const SIMULATED_LATENCY_MS = 60;

function delay(ms = SIMULATED_LATENCY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function getNextOrderId(orders: Order[], auditLogs: AuditLogEntry[]): string {
  let maxNum = 10000;
  for (const ord of orders) {
    const match = /^ORD-(\d+)$/.exec(ord.id);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  for (const log of auditLogs) {
    const match = /ORD-(\d+)/.exec(`${log.entityId} ${log.details}`);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `ORD-${maxNum + 1}`;
}

function getNextCancellationId(cancellations: Cancellation[]): string {
  let maxNum = 1000;
  for (const c of cancellations) {
    const match = /^CAN-(\d+)$/.exec(c.id);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `CAN-${maxNum + 1}`;
}

/**
 * Mock Payment Gateway Refund Simulator
 * Succeeds ~85% of the time when refund failure simulation is enabled in settings.
 * Succeeds 100% of the time when failure simulation is turned off.
 */
function simulatePaymentGatewayRefund(settings: AppSettings): {
  success: boolean;
  error?: string;
} {
  if (!settings.simulateRefundFailure) {
    return { success: true };
  }
  const roll = Math.random();
  if (roll < 0.85) {
    return { success: true };
  }
  const gatewayErrors = [
    'Payment gateway timeout during reversal settlement (GW-504).',
    'Acquiring bank temporarily declined refund batch (GW-429).',
    'Upstream payment processor connection reset (GW-502).',
  ];
  return {
    success: false,
    error: gatewayErrors[Math.floor(Math.random() * gatewayErrors.length)],
  };
}

function appendAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
  const logs = readJson<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOG, []);
  const record: AuditLogEntry = {
    ...entry,
    id: genId('AUD'),
    timestamp: new Date().toISOString(),
  };
  writeJson(STORAGE_KEYS.AUDIT_LOG, [record, ...logs]);
  return record;
}

function pushNotification(
  payload: Omit<AppNotification, 'id' | 'read' | 'createdAt'>
): AppNotification {
  const all = readJson<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const record: AppNotification = {
    ...payload,
    id: genId('NTF'),
    read: false,
    createdAt: new Date().toISOString(),
  };
  writeJson(STORAGE_KEYS.NOTIFICATIONS, [record, ...all]);
  return record;
}

function recomputeOrderActiveAmount(order: Order): number {
  return Number(
    order.items
      .filter((i) => i.status !== OrderItemStatus.CANCELLED)
      .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      .toFixed(2)
  );
}

// ============================================================================
// INITIALIZATION, RESET & EXPORT
// ============================================================================

export async function initDatabase(): Promise<void> {
  const existingUsers = localStorage.getItem(STORAGE_KEYS.USERS);
  const existingProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
  if (!existingUsers || !existingProducts) {
    const seed = buildSeedDataset();
    writeJson(STORAGE_KEYS.USERS, seed.users);
    writeJson(STORAGE_KEYS.PRODUCTS, seed.products);
    writeJson(STORAGE_KEYS.ORDERS, seed.orders);
    writeJson(STORAGE_KEYS.CANCELLATIONS, seed.cancellations);
    writeJson(STORAGE_KEYS.PAYMENTS, seed.payments);
    writeJson(STORAGE_KEYS.AUDIT_LOG, seed.auditLogs);
    writeJson(STORAGE_KEYS.NOTIFICATIONS, seed.notifications);
    writeJson(STORAGE_KEYS.SETTINGS, seed.settings);
  } else {
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      writeJson(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    }
    // Non-destructively replace legacy '$' symbols in persisted audit/notification copy with '₹'
    const logs = readJson<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOG, []);
    if (logs.some((l) => /\$\d/.test(l.details))) {
      writeJson(
        STORAGE_KEYS.AUDIT_LOG,
        logs.map((l) => ({ ...l, details: l.details.replace(/\$(\d)/g, '₹$1') }))
      );
    }
    const notifs = readJson<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
    if (notifs.some((n) => /\$\d/.test(n.message))) {
      writeJson(
        STORAGE_KEYS.NOTIFICATIONS,
        notifs.map((n) => ({ ...n, message: n.message.replace(/\$(\d)/g, '₹$1') }))
      );
    }
  }
}

export async function resetDemoData(actor: User): Promise<void> {
  await delay();
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only administrators can reset demo data.');
  }
  const seed = buildSeedDataset();
  writeJson(STORAGE_KEYS.USERS, seed.users);
  writeJson(STORAGE_KEYS.PRODUCTS, seed.products);
  writeJson(STORAGE_KEYS.ORDERS, seed.orders);
  writeJson(STORAGE_KEYS.CANCELLATIONS, seed.cancellations);
  writeJson(STORAGE_KEYS.PAYMENTS, seed.payments);
  writeJson(STORAGE_KEYS.AUDIT_LOG, seed.auditLogs);
  writeJson(STORAGE_KEYS.NOTIFICATIONS, seed.notifications);
  writeJson(STORAGE_KEYS.SETTINGS, seed.settings);

  // Clear customer carts on demo reset
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith('cocs_cart_')) {
      localStorage.removeItem(k);
    }
  });

  // Ensure session points to seeded admin
  const seededAdmin = seed.users.find((u) => u.role === UserRole.ADMIN)!;
  writeJson(STORAGE_KEYS.SESSION, seededAdmin);

  appendAudit({
    actorId: seededAdmin.id,
    actorName: seededAdmin.name,
    actorRole: seededAdmin.role,
    action: 'DEMO_DATA_RESET',
    entityType: 'SYSTEM',
    entityId: 'SEED',
    details: 'Administrator restored all records to the initial demo dataset.',
  });
}

export async function exportAllDataJson(actor: User): Promise<string> {
  await delay(30);
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only administrators can export system data.');
  }
  const snapshot = {
    exportedAt: new Date().toISOString(),
    exportedBy: actor.email,
    [STORAGE_KEYS.USERS]: readJson<User[]>(STORAGE_KEYS.USERS, []),
    [STORAGE_KEYS.PRODUCTS]: readJson<Product[]>(STORAGE_KEYS.PRODUCTS, []),
    [STORAGE_KEYS.ORDERS]: readJson<Order[]>(STORAGE_KEYS.ORDERS, []),
    [STORAGE_KEYS.CANCELLATIONS]: readJson<Cancellation[]>(STORAGE_KEYS.CANCELLATIONS, []),
    [STORAGE_KEYS.PAYMENTS]: readJson<Payment[]>(STORAGE_KEYS.PAYMENTS, []),
    [STORAGE_KEYS.AUDIT_LOG]: readJson<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOG, []),
    [STORAGE_KEYS.NOTIFICATIONS]: readJson<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []),
    [STORAGE_KEYS.SETTINGS]: readJson<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
  };
  return JSON.stringify(snapshot, null, 2);
}

// ============================================================================
// AUTHENTICATION & USERS
// ============================================================================

export async function getCurrentUser(): Promise<User | null> {
  await initDatabase();
  const session = readJson<User | null>(STORAGE_KEYS.SESSION, null);
  if (!session) return null;
  const users = readJson<User[]>(STORAGE_KEYS.USERS, []);
  const fresh = users.find((u) => u.id === session.id) || null;
  if (!fresh) {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    return null;
  }
  return fresh;
}

export async function login(email: string, password: string): Promise<User> {
  await initDatabase();
  await delay();
  const users = readJson<User[]>(STORAGE_KEYS.USERS, []);
  const normalized = email.trim().toLowerCase();
  const found = users.find(
    (u) => u.email.toLowerCase() === normalized && u.password === password
  );
  if (!found) {
    throw new Error('Invalid email address or password.');
  }
  writeJson(STORAGE_KEYS.SESSION, found);
  return found;
}

export async function loginByDemoRole(role: UserRole): Promise<User> {
  await initDatabase();
  await delay();
  const users = readJson<User[]>(STORAGE_KEYS.USERS, []);
  const found = users.find((u) => u.role === role);
  if (!found) {
    throw new Error(`No demo account found for role ${role}.`);
  }
  writeJson(STORAGE_KEYS.SESSION, found);
  return found;
}

export async function registerCustomer(input: {
  name: string;
  email: string;
  password: string;
  phone: string;
}): Promise<User> {
  await initDatabase();
  await delay();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const phone = input.phone.trim();

  if (name.length < 2) throw new Error('Full name must be at least 2 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (phone.length < 7) {
    throw new Error('Please enter a valid phone number.');
  }

  const users = readJson<User[]>(STORAGE_KEYS.USERS, []);
  if (users.some((u) => u.email.toLowerCase() === email)) {
    throw new Error('An account with this email address already exists.');
  }

  const newUser: User = {
    id: genId('USR'),
    name,
    email,
    password,
    phone,
    role: UserRole.CUSTOMER,
    createdAt: new Date().toISOString(),
  };

  writeJson(STORAGE_KEYS.USERS, [...users, newUser]);
  writeJson(STORAGE_KEYS.SESSION, newUser);

  appendAudit({
    actorId: newUser.id,
    actorName: newUser.name,
    actorRole: UserRole.CUSTOMER,
    action: 'USER_REGISTERED',
    entityType: 'USER',
    entityId: newUser.id,
    details: `New customer registered: ${newUser.name} (${newUser.email}).`,
  });

  pushNotification({
    userId: newUser.id,
    title: 'Welcome to COCS Store',
    message: 'Your account is active. Browse our catalog to place your first order.',
    type: 'info',
  });

  return newUser;
}

export async function logout(): Promise<void> {
  await delay(20);
  localStorage.removeItem(STORAGE_KEYS.SESSION);
}

export async function getUsers(actor: User): Promise<User[]> {
  await delay(30);
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Access denied: administrator privileges required.');
  }
  return readJson<User[]>(STORAGE_KEYS.USERS, []);
}

export async function deleteUser(userId: string, actor: User): Promise<void> {
  await delay();
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only administrators can delete user accounts.');
  }
  if (userId === actor.id) {
    throw new Error('You cannot delete your own active administrator account.');
  }
  const users = readJson<User[]>(STORAGE_KEYS.USERS, []);
  const target = users.find((u) => u.id === userId);
  if (!target) {
    throw new Error('User not found.');
  }
  if (target.role === UserRole.ADMIN) {
    const adminCount = users.filter((u) => u.role === UserRole.ADMIN).length;
    if (adminCount <= 1) {
      throw new Error('Cannot delete the only administrator account.');
    }
  }

  const next = users.filter((u) => u.id !== userId);
  writeJson(STORAGE_KEYS.USERS, next);

  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'USER_DELETED',
    entityType: 'USER',
    entityId: target.id,
    details: `Deleted ${target.role} account ${target.name} (${target.email}).`,
  });
}

// ============================================================================
// CART PERSISTENCE (PER CUSTOMER)
// ============================================================================

export async function getCart(userId: string): Promise<CartItem[]> {
  return readJson<CartItem[]>(`cocs_cart_${userId}`, []);
}

export async function saveCart(userId: string, items: CartItem[]): Promise<CartItem[]> {
  writeJson(`cocs_cart_${userId}`, items);
  return items;
}

// ============================================================================
// PRODUCTS CRUD
// ============================================================================

export async function getProducts(): Promise<Product[]> {
  await initDatabase();
  await delay(25);
  return readJson<Product[]>(STORAGE_KEYS.PRODUCTS, []);
}

export async function createProduct(
  input: Omit<Product, 'id' | 'createdAt'>,
  actor: User
): Promise<Product> {
  await delay();
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only administrators can create products.');
  }
  if (!input.name.trim()) throw new Error('Product name is required.');
  if (input.price <= 0) throw new Error('Product price must be greater than ₹0.');
  if (input.stock < 0 || !Number.isInteger(input.stock)) {
    throw new Error('Stock must be a non-negative whole number.');
  }

  const products = readJson<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  const created: Product = {
    ...input,
    name: input.name.trim(),
    sku: input.sku.trim() || `SKU-${Math.floor(10000 + Math.random() * 89999)}`,
    category: input.category.trim() || 'General',
    description: input.description.trim(),
    price: Number(input.price.toFixed(2)),
    stock: Math.max(0, Math.floor(input.stock)),
    id: genId('PROD'),
    createdAt: new Date().toISOString(),
  };

  writeJson(STORAGE_KEYS.PRODUCTS, [created, ...products]);
  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'PRODUCT_CREATED',
    entityType: 'PRODUCT',
    entityId: created.id,
    details: `Created product "${created.name}" (${formatCurrency(created.price)}, stock: ${created.stock}).`,
  });
  return created;
}

export async function updateProduct(
  productId: string,
  updates: Partial<Omit<Product, 'id' | 'createdAt'>>,
  actor: User
): Promise<Product> {
  await delay();
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only administrators can update products.');
  }
  const products = readJson<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  const idx = products.findIndex((p) => p.id === productId);
  if (idx === -1) throw new Error('Product not found.');

  if (updates.price !== undefined && updates.price <= 0) {
    throw new Error('Product price must be greater than ₹0.');
  }
  if (updates.stock !== undefined && (updates.stock < 0 || !Number.isInteger(updates.stock))) {
    throw new Error('Stock cannot be negative and must be a whole number.');
  }

  const updated: Product = {
    ...products[idx],
    ...updates,
    name: updates.name !== undefined ? updates.name.trim() : products[idx].name,
    price: updates.price !== undefined ? Number(updates.price.toFixed(2)) : products[idx].price,
    stock: updates.stock !== undefined ? Math.max(0, Math.floor(updates.stock)) : products[idx].stock,
  };

  products[idx] = updated;
  writeJson(STORAGE_KEYS.PRODUCTS, products);

  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'PRODUCT_UPDATED',
    entityType: 'PRODUCT',
    entityId: updated.id,
    details: `Updated product "${updated.name}" (${formatCurrency(updated.price)}, stock: ${updated.stock}).`,
  });
  return updated;
}

export async function deleteProduct(productId: string, actor: User): Promise<void> {
  await delay();
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only administrators can delete products.');
  }
  const products = readJson<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  const target = products.find((p) => p.id === productId);
  if (!target) throw new Error('Product not found.');

  writeJson(
    STORAGE_KEYS.PRODUCTS,
    products.filter((p) => p.id !== productId)
  );
  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'PRODUCT_DELETED',
    entityType: 'PRODUCT',
    entityId: target.id,
    details: `Removed product "${target.name}" (${target.sku}) from catalog.`,
  });
}

// ============================================================================
// ORDERS CRUD (WITH STRICT RBAC & STOCK PROTECTION)
// ============================================================================

export async function getOrders(viewer: User, includeSoftDeleted = false): Promise<Order[]> {
  await initDatabase();
  await delay(30);
  const all = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  if (viewer.role === UserRole.CUSTOMER) {
    return all
      .filter((o) => o.customerId === viewer.id && (includeSoftDeleted || !o.isDeleted))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  // Agents and Admins can see all orders (including customer-soft-deleted ones for reporting/auditing)
  return all.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getOrderById(orderId: string, viewer: User): Promise<Order | null> {
  await initDatabase();
  await delay(25);
  const all = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const order = all.find((o) => o.id === orderId) || null;
  if (!order) return null;
  // Enforce RBAC: customers can never view another customer's order
  if (viewer.role === UserRole.CUSTOMER && order.customerId !== viewer.id) {
    throw new Error('Access denied: you can only view your own orders.');
  }
  return order;
}

export async function createOrder(
  payload: {
    items: CartItem[];
    paymentMethod: PaymentMethod;
    shippingAddress: string;
  },
  customer: User
): Promise<Order> {
  await delay(120);
  if (customer.role !== UserRole.CUSTOMER) {
    throw new Error('Only customer accounts can place store orders.');
  }
  const address = payload.shippingAddress.trim();
  if (address.length < 10) {
    throw new Error('Please enter a complete shipping address (at least 10 characters).');
  }
  if (!payload.items.length) {
    throw new Error('Your cart is empty.');
  }

  const products = readJson<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const auditLogs = readJson<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOG, []);
  const payments = readJson<Payment[]>(STORAGE_KEYS.PAYMENTS, []);

  // Validate stock strictly before mutating anything (never allow negative stock)
  const resolvedItems: OrderItem[] = [];
  for (const ci of payload.items) {
    if (ci.quantity <= 0 || !Number.isInteger(ci.quantity)) {
      throw new Error('Invalid item quantity in cart.');
    }
    const prod = products.find((p) => p.id === ci.productId);
    if (!prod) {
      throw new Error('One of the items in your cart is no longer available.');
    }
    if (prod.stock < ci.quantity) {
      throw new Error(
        `Insufficient stock for "${prod.name}". Only ${prod.stock} remaining.`
      );
    }
    resolvedItems.push({
      itemId: genId('ITM'),
      productId: prod.id,
      productName: prod.name,
      productImage: prod.imageUrl,
      unitPrice: prod.price,
      quantity: ci.quantity,
      status: OrderItemStatus.ACTIVE,
    });
  }

  // Deduct stock atomically
  for (const ci of payload.items) {
    const prod = products.find((p) => p.id === ci.productId)!;
    prod.stock = Math.max(0, prod.stock - ci.quantity);
  }

  const totalAmount = Number(
    resolvedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0).toFixed(2)
  );
  const now = new Date().toISOString();
  const orderId = getNextOrderId(orders, auditLogs);

  const newOrder: Order = {
    id: orderId,
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: customer.email,
    items: resolvedItems,
    totalAmount,
    activeAmount: totalAmount,
    status: OrderStatus.PLACED,
    paymentMethod: payload.paymentMethod,
    shippingAddress: address,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    statusHistory: [
      {
        status: OrderStatus.PLACED,
        timestamp: now,
        note: `Order placed via ${payload.paymentMethod}.`,
        actorName: customer.name,
      },
    ],
  };

  const paymentNumber = orderId.replace('ORD-', '');
  const newPayment: Payment = {
    id: `PAY-${paymentNumber}`,
    orderId,
    customerId: customer.id,
    method: payload.paymentMethod,
    amount: totalAmount,
    refundedAmount: 0,
    status:
      payload.paymentMethod === PaymentMethod.COD
        ? PaymentStatus.COD_PENDING
        : PaymentStatus.PAID,
    transactionRef: `TXN-${Math.floor(100000 + Math.random() * 899999)}`,
    createdAt: now,
    updatedAt: now,
  };

  writeJson(STORAGE_KEYS.PRODUCTS, products);
  writeJson(STORAGE_KEYS.ORDERS, [newOrder, ...orders]);
  writeJson(STORAGE_KEYS.PAYMENTS, [newPayment, ...payments]);
  localStorage.removeItem(`cocs_cart_${customer.id}`);

  appendAudit({
    actorId: customer.id,
    actorName: customer.name,
    actorRole: customer.role,
    action: 'ORDER_PLACED',
    entityType: 'ORDER',
    entityId: orderId,
    details: `Placed ${orderId} (${resolvedItems.length} item${resolvedItems.length > 1 ? 's' : ''}, ${formatCurrency(totalAmount)}) via ${payload.paymentMethod}.`,
  });

  pushNotification({
    userId: customer.id,
    title: `Order ${orderId} Placed`,
    message: `Thank you! Your order totaling ${formatCurrency(totalAmount)} has been placed.`,
    type: 'success',
    orderId,
  });

  return newOrder;
}

export async function advanceOrderStatus(orderId: string, actor: User): Promise<Order> {
  await delay(90);
  if (actor.role !== UserRole.AGENT && actor.role !== UserRole.ADMIN) {
    throw new Error('Only Support Agents and Administrators can advance order status.');
  }

  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx === -1) throw new Error('Order not found.');

  const order = orders[idx];
  const nextStatus = getNextOrderStatus(order.status);
  if (!nextStatus) {
    throw new Error(`Order ${orderId} is already in terminal status ${order.status}.`);
  }

  // Prevent shipping an order that has an unresolved cancellation request
  const hasPendingCancel = order.items.some(
    (i) => i.status === OrderItemStatus.PENDING_CANCELLATION
  );
  if (nextStatus === OrderStatus.SHIPPED && hasPendingCancel) {
    throw new Error(
      'Cannot mark as Shipped while a cancellation request is pending review. Please approve or reject the pending request first.'
    );
  }

  const prevStatus = order.status;
  const now = new Date().toISOString();
  const updated: Order = {
    ...order,
    status: nextStatus,
    updatedAt: now,
    statusHistory: [
      ...order.statusHistory,
      {
        status: nextStatus,
        timestamp: now,
        note: `Status updated from ${prevStatus} to ${nextStatus}.`,
        actorName: actor.name,
      },
    ],
  };

  // If COD order is delivered, settle payment status to PAID
  if (nextStatus === OrderStatus.DELIVERED && order.paymentMethod === PaymentMethod.COD) {
    const payments = readJson<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    const pIdx = payments.findIndex((p) => p.orderId === orderId);
    if (pIdx !== -1 && payments[pIdx].status === PaymentStatus.COD_PENDING) {
      payments[pIdx] = {
        ...payments[pIdx],
        status: PaymentStatus.PAID,
        updatedAt: now,
      };
      writeJson(STORAGE_KEYS.PAYMENTS, payments);
    }
  }

  orders[idx] = updated;
  writeJson(STORAGE_KEYS.ORDERS, orders);

  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'ORDER_STATUS_ADVANCED',
    entityType: 'ORDER',
    entityId: orderId,
    details: `Advanced ${orderId} from ${prevStatus} to ${nextStatus}.`,
  });

  pushNotification({
    userId: order.customerId,
    title: `Order ${orderId} is now ${nextStatus}`,
    message: `Your order ${orderId} status has been updated to ${nextStatus}.`,
    type: nextStatus === OrderStatus.DELIVERED ? 'success' : 'info',
    orderId,
  });

  return updated;
}

export async function updateOrderAddress(
  orderId: string,
  newAddress: string,
  customer: User
): Promise<Order> {
  await delay(80);
  const trimmed = newAddress.trim();
  if (trimmed.length < 10) {
    throw new Error('Shipping address must be at least 10 characters.');
  }

  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx === -1) throw new Error('Order not found.');

  const order = orders[idx];
  if (customer.role === UserRole.CUSTOMER && order.customerId !== customer.id) {
    throw new Error('Access denied: you cannot edit another customer’s order.');
  }
  if (!canCustomerEditAddress(order)) {
    throw new Error(
      `Shipping address can only be edited while an order is PLACED or CONFIRMED (current status: ${order.status}).`
    );
  }

  const now = new Date().toISOString();
  const updated: Order = {
    ...order,
    shippingAddress: trimmed,
    updatedAt: now,
  };
  orders[idx] = updated;
  writeJson(STORAGE_KEYS.ORDERS, orders);

  appendAudit({
    actorId: customer.id,
    actorName: customer.name,
    actorRole: customer.role,
    action: 'ORDER_ADDRESS_UPDATED',
    entityType: 'ORDER',
    entityId: orderId,
    details: `Updated shipping address on ${orderId} to "${trimmed}".`,
  });

  return updated;
}

/**
 * Customer soft-delete: sets isDeleted = true ONLY for CANCELLED or DELIVERED orders.
 * Keeps record intact for Admin reports and audit logs.
 */
export async function softDeleteOrder(orderId: string, customer: User): Promise<Order> {
  await delay(70);
  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx === -1) throw new Error('Order not found.');

  const order = orders[idx];
  if (order.customerId !== customer.id) {
    throw new Error('Access denied: you cannot delete another customer’s order.');
  }
  if (!canCustomerSoftDeleteOrder(order)) {
    throw new Error(
      `Active orders (${order.status}) cannot be deleted. Please cancel the order first.`
    );
  }

  const now = new Date().toISOString();
  const updated: Order = {
    ...order,
    isDeleted: true,
    deletedAt: now,
    updatedAt: now,
  };
  orders[idx] = updated;
  writeJson(STORAGE_KEYS.ORDERS, orders);

  appendAudit({
    actorId: customer.id,
    actorName: customer.name,
    actorRole: customer.role,
    action: 'ORDER_SOFT_DELETED',
    entityType: 'ORDER',
    entityId: orderId,
    details: `Customer removed ${orderId} (${order.status}) from their personal order history.`,
  });

  return updated;
}

/**
 * Undo customer soft-delete (invoked from the 5-second Undo toast).
 */
export async function restoreSoftDeletedOrder(
  orderId: string,
  customer: User
): Promise<Order> {
  await delay(50);
  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx === -1) throw new Error('Order not found.');

  const order = orders[idx];
  if (order.customerId !== customer.id) {
    throw new Error('Access denied.');
  }

  const updated: Order = {
    ...order,
    isDeleted: false,
    deletedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  orders[idx] = updated;
  writeJson(STORAGE_KEYS.ORDERS, orders);

  appendAudit({
    actorId: customer.id,
    actorName: customer.name,
    actorRole: customer.role,
    action: 'ORDER_RESTORED',
    entityType: 'ORDER',
    entityId: orderId,
    details: `Customer undid removal of ${orderId}; order restored to personal history.`,
  });

  return updated;
}

/**
 * Administrator hard-delete: permanently removes order, its payment, and its cancellation records.
 */
export async function hardDeleteOrder(orderId: string, actor: User): Promise<void> {
  await delay(100);
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only Administrators can permanently delete orders.');
  }

  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const target = orders.find((o) => o.id === orderId);
  if (!target) throw new Error('Order not found.');

  const payments = readJson<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
  const cancellations = readJson<Cancellation[]>(STORAGE_KEYS.CANCELLATIONS, []);

  writeJson(
    STORAGE_KEYS.ORDERS,
    orders.filter((o) => o.id !== orderId)
  );
  writeJson(
    STORAGE_KEYS.PAYMENTS,
    payments.filter((p) => p.orderId !== orderId)
  );
  writeJson(
    STORAGE_KEYS.CANCELLATIONS,
    cancellations.filter((c) => c.orderId !== orderId)
  );

  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'ORDER_HARD_DELETED',
    entityType: 'ORDER',
    entityId: orderId,
    details: `Administrator permanently deleted ${orderId} (${target.customerName}, ${formatCurrency(target.totalAmount)}) along with linked payment and cancellation records.`,
  });
}

// ============================================================================
// CANCELLATIONS & REFUNDS
// ============================================================================

export async function getCancellations(viewer: User): Promise<Cancellation[]> {
  await initDatabase();
  await delay(30);
  const all = readJson<Cancellation[]>(STORAGE_KEYS.CANCELLATIONS, []);
  const list =
    viewer.role === UserRole.CUSTOMER
      ? all.filter((c) => c.customerId === viewer.id)
      : all;
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getCancellationsByOrderId(
  orderId: string,
  viewer: User
): Promise<Cancellation[]> {
  const all = await getCancellations(viewer);
  return all.filter((c) => c.orderId === orderId);
}

export async function getPayments(viewer: User): Promise<Payment[]> {
  await initDatabase();
  await delay(25);
  const all = readJson<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
  if (viewer.role === UserRole.CUSTOMER) {
    return all.filter((p) => p.customerId === viewer.id);
  }
  return all;
}

export async function getPaymentByOrderId(
  orderId: string,
  viewer: User
): Promise<Payment | null> {
  const list = await getPayments(viewer);
  return list.find((p) => p.orderId === orderId) || null;
}

/**
 * Helper to apply an approved cancellation's side effects atomically:
 * - Marks selected items CANCELLED (and sets Order = CANCELLED if no active/pending items remain)
 * - Restocks cancelled quantities back into cocs_products
 * - Runs mock payment gateway (~85% success when failure sim is ON)
 * - Updates Payment record
 * - Writes Audit Log & Customer Notification
 */
function finalizeApprovedCancellation(params: {
  order: Order;
  orders: Order[];
  orderIdx: number;
  cancellation: Cancellation;
  settings: AppSettings;
  actor: User;
  isAutoApproved: boolean;
}): { order: Order; cancellation: Cancellation } {
  const { order, orders, orderIdx, cancellation, settings, actor, isAutoApproved } =
    params;
  const now = new Date().toISOString();
  const targetItemIds = new Set(cancellation.items.map((i) => i.itemId));

  // 1. Update item statuses
  const updatedItems = order.items.map((item) =>
    targetItemIds.has(item.itemId)
      ? { ...item, status: OrderItemStatus.CANCELLED }
      : item
  );

  const anyRemainingNonCancelled = updatedItems.some(
    (i) => i.status !== OrderItemStatus.CANCELLED
  );

  // 2. Restock cancelled quantities back to product inventory
  const products = readJson<Product[]>(STORAGE_KEYS.PRODUCTS, []);
  for (const ci of cancellation.items) {
    const pIdx = products.findIndex((p) => p.id === ci.productId);
    if (pIdx !== -1) {
      products[pIdx] = {
        ...products[pIdx],
        stock: products[pIdx].stock + ci.quantity,
      };
    }
  }
  writeJson(STORAGE_KEYS.PRODUCTS, products);

  // 3. Simulate payment gateway refund (~85% success rate if enabled)
  const gatewayResult = simulatePaymentGatewayRefund(settings);
  const refundStatus = gatewayResult.success
    ? RefundStatus.REFUNDED
    : RefundStatus.REFUND_PENDING;

  // 4. Update Order record
  const nextOrderStatus = anyRemainingNonCancelled
    ? order.status
    : OrderStatus.CANCELLED;

  const updatedOrder: Order = {
    ...order,
    items: updatedItems,
    activeAmount: recomputeOrderActiveAmount({ ...order, items: updatedItems }),
    status: nextOrderStatus,
    updatedAt: now,
    statusHistory:
      nextOrderStatus === OrderStatus.CANCELLED
        ? [
            ...order.statusHistory,
            {
              status: OrderStatus.CANCELLED,
              timestamp: now,
              note: `${
                isAutoApproved ? 'Auto-approved' : `Approved by ${actor.name}`
              } cancellation (${cancellation.reason}). Refund ${
                gatewayResult.success
                  ? `${formatCurrency(cancellation.refundAmount)} completed`
                  : 'pending gateway retry'
              }.`,
              actorName: actor.name,
            },
          ]
        : order.statusHistory,
  };
  orders[orderIdx] = updatedOrder;
  writeJson(STORAGE_KEYS.ORDERS, orders);

  // 5. Update Payment record
  const payments = readJson<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
  const payIdx = payments.findIndex((p) => p.orderId === order.id);
  if (payIdx !== -1) {
    const pay = payments[payIdx];
    const nextRefunded = gatewayResult.success
      ? Number(Math.min(pay.amount, pay.refundedAmount + cancellation.refundAmount).toFixed(2))
      : pay.refundedAmount;

    let nextPayStatus: PaymentStatus = pay.status;
    if (!gatewayResult.success) {
      nextPayStatus = PaymentStatus.REFUND_PENDING;
    } else if (nextRefunded >= pay.amount) {
      nextPayStatus = PaymentStatus.REFUNDED;
    } else if (nextRefunded > 0) {
      nextPayStatus = PaymentStatus.PARTIALLY_REFUNDED;
    }

    payments[payIdx] = {
      ...pay,
      refundedAmount: nextRefunded,
      status: nextPayStatus,
      updatedAt: now,
    };
    writeJson(STORAGE_KEYS.PAYMENTS, payments);
  }

  // 6. Finalize Cancellation record
  const updatedCancellation: Cancellation = {
    ...cancellation,
    status: CancellationStatus.APPROVED,
    refundStatus,
    refundAttempts: cancellation.refundAttempts + 1,
    lastRefundError: gatewayResult.success ? undefined : gatewayResult.error,
    processedBy: isAutoApproved ? 'Auto-Approval Engine' : actor.name,
    updatedAt: now,
  };

  // 7. Audit Log
  const totalQtyRestocked = cancellation.items.reduce((s, i) => s + i.quantity, 0);
  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: gatewayResult.success
      ? isAutoApproved
        ? 'ORDER_CANCELLED_AUTO'
        : 'CANCELLATION_APPROVED'
      : 'REFUND_FAILED_PENDING',
    entityType: 'CANCELLATION',
    entityId: updatedCancellation.id,
    details: `${
      updatedCancellation.isPartial ? 'Partial' : 'Full'
    } cancellation ${updatedCancellation.id} on ${order.id} (${
      updatedCancellation.reason
    }). Restocked ${totalQtyRestocked} unit(s). Refund ${formatCurrency(
      updatedCancellation.refundAmount
    )}: ${
      gatewayResult.success
        ? 'REFUNDED'
        : `REFUND_PENDING (${gatewayResult.error})`
    }.`,
  });

  // 8. Customer Notification
  if (gatewayResult.success) {
    pushNotification({
      userId: order.customerId,
      title: updatedCancellation.isPartial
        ? `Partial Cancellation Refunded (${order.id})`
        : `Order ${order.id} Cancelled & Refunded`,
      message: `Your cancellation (${updatedCancellation.id}) was approved and ${formatCurrency(
        updatedCancellation.refundAmount
      )} has been refunded via ${order.paymentMethod}.`,
      type: 'success',
      orderId: order.id,
    });
  } else {
    pushNotification({
      userId: order.customerId,
      title: `Refund Pending Retry (${order.id})`,
      message: `Your cancellation (${updatedCancellation.id}) is approved, but the ${formatCurrency(
        updatedCancellation.refundAmount
      )} refund failed at the payment gateway. Support has been alerted to retry your refund.`,
      type: 'warning',
      orderId: order.id,
    });
  }

  return { order: updatedOrder, cancellation: updatedCancellation };
}

/**
 * Customer submits a full or partial cancellation request.
 * Re-reads and re-validates the order state immediately before saving to prevent
 * double submission or stale-state duplicate refunds.
 */
export async function createCancellationRequest(
  payload: {
    orderId: string;
    selectedItemIds: string[];
    reason: string;
    comments: string;
  },
  customer: User
): Promise<{ order: Order; cancellation: Cancellation }> {
  await delay(140);

  if (customer.role !== UserRole.CUSTOMER) {
    throw new Error('Only customers can submit cancellation requests.');
  }
  if (!payload.reason.trim()) {
    throw new Error('Please select a cancellation reason.');
  }
  if (!payload.selectedItemIds.length) {
    throw new Error('Please select at least one item to cancel.');
  }

  // Re-check latest state immediately before writing (double-submission / race protection)
  const settings = readJson<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const orderIdx = orders.findIndex((o) => o.id === payload.orderId);
  if (orderIdx === -1) {
    throw new Error('Order not found.');
  }

  const order = orders[orderIdx];
  if (order.customerId !== customer.id) {
    throw new Error('Access denied: you cannot cancel another customer’s order.');
  }

  const eligibility = evaluateCancellationEligibility(order, settings);
  if (!eligibility.allowed) {
    throw new Error(eligibility.reasonMessage);
  }

  // Verify every selected item is still strictly ACTIVE (prevents duplicate refunds)
  const uniqueIds = Array.from(new Set(payload.selectedItemIds));
  const selectedOrderItems: OrderItem[] = [];
  for (const itemId of uniqueIds) {
    const found = order.items.find((i) => i.itemId === itemId);
    if (!found) {
      throw new Error('Selected item was not found on this order.');
    }
    if (found.status !== OrderItemStatus.ACTIVE) {
      throw new Error(
        `"${found.productName}" is already cancelled or pending cancellation. Duplicate refunds are blocked.`
      );
    }
    selectedOrderItems.push(found);
  }

  const summaryItems: CancellationItemSummary[] = selectedOrderItems.map((i) => ({
    itemId: i.itemId,
    productId: i.productId,
    productName: i.productName,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    subtotal: Number((i.unitPrice * i.quantity).toFixed(2)),
  }));

  const refundAmount = Number(
    summaryItems.reduce((sum, i) => sum + i.subtotal, 0).toFixed(2)
  );
  const isPartial = selectedOrderItems.length < order.items.length;

  const cancellations = readJson<Cancellation[]>(STORAGE_KEYS.CANCELLATIONS, []);
  const now = new Date().toISOString();
  const cancellationId = getNextCancellationId(cancellations);

  const baseCancellation: Cancellation = {
    id: cancellationId,
    orderId: order.id,
    customerId: customer.id,
    customerName: customer.name,
    orderStatusAtRequest: order.status,
    isPartial,
    items: summaryItems,
    reason: payload.reason.trim(),
    comments: payload.comments.trim(),
    status: CancellationStatus.PENDING,
    refundAmount,
    refundStatus: RefundStatus.PENDING_APPROVAL,
    refundAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  // CASE A: PACKED order requiring Support Agent approval -> stays PENDING
  if (eligibility.requiresApproval) {
    const selectedSet = new Set(uniqueIds);
    const updatedOrder: Order = {
      ...order,
      items: order.items.map((item) =>
        selectedSet.has(item.itemId)
          ? { ...item, status: OrderItemStatus.PENDING_CANCELLATION }
          : item
      ),
      updatedAt: now,
    };
    orders[orderIdx] = updatedOrder;
    writeJson(STORAGE_KEYS.ORDERS, orders);
    writeJson(STORAGE_KEYS.CANCELLATIONS, [baseCancellation, ...cancellations]);

    appendAudit({
      actorId: customer.id,
      actorName: customer.name,
      actorRole: customer.role,
      action: 'CANCELLATION_REQUESTED',
      entityType: 'CANCELLATION',
      entityId: cancellationId,
      details: `Requested ${isPartial ? 'partial' : 'full'} cancellation on PACKED order ${order.id} (${formatCurrency(refundAmount)}, Reason: ${baseCancellation.reason}). Pending agent approval.`,
    });

    pushNotification({
      userId: customer.id,
      title: `Cancellation Request Pending (${order.id})`,
      message: `Your cancellation request ${cancellationId} for ${formatCurrency(refundAmount)} has been submitted for Support Agent approval.`,
      type: 'warning',
      orderId: order.id,
    });

    return { order: updatedOrder, cancellation: baseCancellation };
  }

  // CASE B: PLACED / CONFIRMED (or PACKED with auto-approval enabled) -> Auto-approve immediately
  const result = finalizeApprovedCancellation({
    order,
    orders,
    orderIdx,
    cancellation: baseCancellation,
    settings,
    actor: customer,
    isAutoApproved: true,
  });

  writeJson(STORAGE_KEYS.CANCELLATIONS, [result.cancellation, ...cancellations]);
  return result;
}

/**
 * Support Agent / Admin approves a PENDING cancellation request.
 */
export async function approveCancellation(
  cancellationId: string,
  agent: User
): Promise<{ order: Order; cancellation: Cancellation }> {
  await delay(120);
  if (agent.role !== UserRole.AGENT && agent.role !== UserRole.ADMIN) {
    throw new Error('Only Support Agents and Administrators can approve cancellations.');
  }

  const settings = readJson<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  const cancellations = readJson<Cancellation[]>(STORAGE_KEYS.CANCELLATIONS, []);
  const cIdx = cancellations.findIndex((c) => c.id === cancellationId);
  if (cIdx === -1) throw new Error('Cancellation request not found.');

  const cancellation = cancellations[cIdx];
  if (cancellation.status !== CancellationStatus.PENDING) {
    throw new Error(
      `Cancellation ${cancellationId} has already been ${cancellation.status.toLowerCase()}.`
    );
  }

  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const orderIdx = orders.findIndex((o) => o.id === cancellation.orderId);
  if (orderIdx === -1) throw new Error('Linked order no longer exists.');

  const result = finalizeApprovedCancellation({
    order: orders[orderIdx],
    orders,
    orderIdx,
    cancellation,
    settings,
    actor: agent,
    isAutoApproved: false,
  });

  cancellations[cIdx] = result.cancellation;
  writeJson(STORAGE_KEYS.CANCELLATIONS, cancellations);

  return result;
}

/**
 * Support Agent / Admin rejects a PENDING cancellation request with a mandatory reason.
 */
export async function rejectCancellation(
  cancellationId: string,
  rejectReason: string,
  agent: User
): Promise<Cancellation> {
  await delay(100);
  if (agent.role !== UserRole.AGENT && agent.role !== UserRole.ADMIN) {
    throw new Error('Only Support Agents and Administrators can reject cancellations.');
  }
  const trimmedReason = rejectReason.trim();
  if (trimmedReason.length < 5) {
    throw new Error('Please provide a clear rejection reason (at least 5 characters).');
  }

  const cancellations = readJson<Cancellation[]>(STORAGE_KEYS.CANCELLATIONS, []);
  const cIdx = cancellations.findIndex((c) => c.id === cancellationId);
  if (cIdx === -1) throw new Error('Cancellation request not found.');

  const cancellation = cancellations[cIdx];
  if (cancellation.status !== CancellationStatus.PENDING) {
    throw new Error(
      `Cancellation ${cancellationId} has already been ${cancellation.status.toLowerCase()}.`
    );
  }

  const now = new Date().toISOString();

  // Restore order items from PENDING_CANCELLATION back to ACTIVE
  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const orderIdx = orders.findIndex((o) => o.id === cancellation.orderId);
  if (orderIdx !== -1) {
    const targetIds = new Set(cancellation.items.map((i) => i.itemId));
    orders[orderIdx] = {
      ...orders[orderIdx],
      items: orders[orderIdx].items.map((item) =>
        targetIds.has(item.itemId) &&
        item.status === OrderItemStatus.PENDING_CANCELLATION
          ? { ...item, status: OrderItemStatus.ACTIVE }
          : item
      ),
      updatedAt: now,
    };
    writeJson(STORAGE_KEYS.ORDERS, orders);
  }

  const updated: Cancellation = {
    ...cancellation,
    status: CancellationStatus.REJECTED,
    refundStatus: RefundStatus.NOT_APPLICABLE,
    rejectReason: trimmedReason,
    processedBy: agent.name,
    updatedAt: now,
  };
  cancellations[cIdx] = updated;
  writeJson(STORAGE_KEYS.CANCELLATIONS, cancellations);

  appendAudit({
    actorId: agent.id,
    actorName: agent.name,
    actorRole: agent.role,
    action: 'CANCELLATION_REJECTED',
    entityType: 'CANCELLATION',
    entityId: cancellationId,
    details: `Rejected cancellation ${cancellationId} on ${cancellation.orderId}. Reason: "${trimmedReason}".`,
  });

  pushNotification({
    userId: cancellation.customerId,
    title: `Cancellation Request Rejected (${cancellation.orderId})`,
    message: `Your request ${cancellationId} was declined by support: ${trimmedReason}`,
    type: 'error',
    orderId: cancellation.orderId,
  });

  return updated;
}

/**
 * Retry a failed payment gateway refund (REFUND_PENDING -> REFUNDED or stays REFUND_PENDING).
 */
export async function retryRefund(
  cancellationId: string,
  actor: User
): Promise<{ success: boolean; cancellation: Cancellation }> {
  await delay(140);
  if (actor.role !== UserRole.AGENT && actor.role !== UserRole.ADMIN) {
    throw new Error('Only Support Agents and Administrators can retry refunds.');
  }

  const settings = readJson<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  const cancellations = readJson<Cancellation[]>(STORAGE_KEYS.CANCELLATIONS, []);
  const cIdx = cancellations.findIndex((c) => c.id === cancellationId);
  if (cIdx === -1) throw new Error('Cancellation record not found.');

  const cancellation = cancellations[cIdx];
  if (
    cancellation.status !== CancellationStatus.APPROVED ||
    cancellation.refundStatus !== RefundStatus.REFUND_PENDING
  ) {
    throw new Error('This cancellation does not have a pending refund to retry.');
  }

  const gateway = simulatePaymentGatewayRefund(settings);
  const now = new Date().toISOString();

  const updated: Cancellation = {
    ...cancellation,
    refundAttempts: cancellation.refundAttempts + 1,
    refundStatus: gateway.success ? RefundStatus.REFUNDED : RefundStatus.REFUND_PENDING,
    lastRefundError: gateway.success ? undefined : gateway.error,
    processedBy: actor.name,
    updatedAt: now,
  };
  cancellations[cIdx] = updated;
  writeJson(STORAGE_KEYS.CANCELLATIONS, cancellations);

  if (gateway.success) {
    const payments = readJson<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    const pIdx = payments.findIndex((p) => p.orderId === cancellation.orderId);
    if (pIdx !== -1) {
      const pay = payments[pIdx];
      const nextRefunded = Number(
        Math.min(pay.amount, pay.refundedAmount + cancellation.refundAmount).toFixed(2)
      );
      payments[pIdx] = {
        ...pay,
        refundedAmount: nextRefunded,
        status:
          nextRefunded >= pay.amount
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
        updatedAt: now,
      };
      writeJson(STORAGE_KEYS.PAYMENTS, payments);
    }

    appendAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'REFUND_RETRY_SUCCEEDED',
      entityType: 'PAYMENT',
      entityId: cancellation.orderId,
      details: `Retry #${updated.refundAttempts} succeeded for ${cancellation.id}. Refunded ${formatCurrency(cancellation.refundAmount)}.`,
    });

    pushNotification({
      userId: cancellation.customerId,
      title: `Refund Completed (${cancellation.orderId})`,
      message: `Your pending refund of ${formatCurrency(cancellation.refundAmount)} for ${cancellation.orderId} has now been successfully processed.`,
      type: 'success',
      orderId: cancellation.orderId,
    });
  } else {
    appendAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'REFUND_RETRY_FAILED',
      entityType: 'PAYMENT',
      entityId: cancellation.orderId,
      details: `Retry #${updated.refundAttempts} failed for ${cancellation.id}: ${gateway.error}`,
    });
  }

  return { success: gateway.success, cancellation: updated };
}

// ============================================================================
// NOTIFICATIONS, AUDIT LOG & SETTINGS
// ============================================================================

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  await initDatabase();
  await delay(20);
  const all = readJson<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  return all
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<void> {
  const all = readJson<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const next = all.map((n) =>
    n.id === notificationId && n.userId === userId ? { ...n, read: true } : n
  );
  writeJson(STORAGE_KEYS.NOTIFICATIONS, next);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const all = readJson<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const next = all.map((n) => (n.userId === userId ? { ...n, read: true } : n));
  writeJson(STORAGE_KEYS.NOTIFICATIONS, next);
}

export async function getAuditLogs(actor: User): Promise<AuditLogEntry[]> {
  await initDatabase();
  await delay(25);
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only administrators can inspect the full audit log.');
  }
  const all = readJson<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOG, []);
  return all.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function getSettings(): Promise<AppSettings> {
  await initDatabase();
  return readJson<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function updateSettings(
  updates: Partial<AppSettings>,
  actor: User
): Promise<AppSettings> {
  await delay(60);
  if (actor.role !== UserRole.ADMIN) {
    throw new Error('Only administrators can modify system settings.');
  }
  const current = readJson<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  const next: AppSettings = { ...current, ...updates };
  writeJson(STORAGE_KEYS.SETTINGS, next);

  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'SETTINGS_UPDATED',
    entityType: 'SETTINGS',
    entityId: 'cocs_settings',
    details: `Updated policy settings: allowCancelPacked=${next.allowCancelPacked}, packedNeedsAgentApproval=${next.packedNeedsAgentApproval}, simulateRefundFailure=${next.simulateRefundFailure}.`,
  });

  return next;
}
