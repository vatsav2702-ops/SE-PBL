export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  ADMIN = 'ADMIN',
}

export enum OrderStatus {
  PLACED = 'PLACED',
  CONFIRMED = 'CONFIRMED',
  PACKED = 'PACKED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum OrderItemStatus {
  ACTIVE = 'ACTIVE',
  PENDING_CANCELLATION = 'PENDING_CANCELLATION',
  CANCELLED = 'CANCELLED',
}

export enum CancellationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum RefundStatus {
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  REFUND_PENDING = 'REFUND_PENDING',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CARD = 'Card',
  UPI = 'UPI',
  WALLET = 'Wallet',
  COD = 'Cash on Delivery',
}

export enum PaymentStatus {
  PAID = 'PAID',
  COD_PENDING = 'COD_PENDING',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
  REFUND_PENDING = 'REFUND_PENDING',
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  role: UserRole;
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  imageUrl: string;
  createdAt: string;
}

export interface OrderItem {
  itemId: string;
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  status: OrderItemStatus;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp: string;
  note: string;
  actorName: string;
}

export interface Order {
  id: string; // e.g., ORD-10001
  customerId: string;
  customerName: string;
  customerEmail: string;
  items: OrderItem[];
  totalAmount: number;
  activeAmount: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  shippingAddress: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean; // Customer soft-delete flag
  deletedAt?: string;
  statusHistory: StatusHistoryEntry[];
}

export interface CancellationItemSummary {
  itemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Cancellation {
  id: string; // e.g., CAN-1001
  orderId: string;
  customerId: string;
  customerName: string;
  orderStatusAtRequest: OrderStatus;
  isPartial: boolean;
  items: CancellationItemSummary[];
  reason: string;
  comments: string;
  status: CancellationStatus;
  refundAmount: number;
  refundStatus: RefundStatus;
  refundAttempts: number;
  lastRefundError?: string;
  rejectReason?: string;
  processedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string; // e.g., PAY-10001
  orderId: string;
  customerId: string;
  method: PaymentMethod;
  amount: number;
  refundedAmount: number;
  status: PaymentStatus;
  transactionRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: 'ORDER' | 'CANCELLATION' | 'PAYMENT' | 'PRODUCT' | 'USER' | 'SETTINGS' | 'SYSTEM';
  entityId: string;
  details: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  orderId?: string;
  read: boolean;
  createdAt: string;
}

export interface AppSettings {
  allowCancelPacked: boolean;
  packedNeedsAgentApproval: boolean;
  simulateRefundFailure: boolean;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export type AppView =
  | 'shop'
  | 'cart'
  | 'my-orders'
  | 'order-details'
  | 'cancel-order'
  | 'my-cancellations'
  | 'notifications'
  | 'agent-pending'
  | 'all-orders'
  | 'all-cancellations'
  | 'admin-dashboard'
  | 'admin-products'
  | 'admin-users'
  | 'admin-reports'
  | 'admin-audit'
  | 'admin-settings';
