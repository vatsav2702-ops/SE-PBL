import {
  AppSettings,
  Order,
  OrderItemStatus,
  OrderStatus,
  UserRole,
} from '../types';

/**
 * LocalStorage keys mandated by the COCS specification.
 * All persistent records live strictly under these keys.
 */
export const STORAGE_KEYS = {
  USERS: 'cocs_users',
  PRODUCTS: 'cocs_products',
  ORDERS: 'cocs_orders',
  CANCELLATIONS: 'cocs_cancellations',
  PAYMENTS: 'cocs_payments',
  AUDIT_LOG: 'cocs_auditlog',
  NOTIFICATIONS: 'cocs_notifications',
  SETTINGS: 'cocs_settings',
  SESSION: 'cocs_session',
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  allowCancelPacked: true,
  packedNeedsAgentApproval: true,
  simulateRefundFailure: true,
};

/**
 * Mandatory cancellation reasons dropdown options.
 */
export const CANCELLATION_REASONS = [
  'Ordered by mistake',
  'Found a better price',
  'Delivery too slow',
  'Changed my mind',
  'Other',
] as const;

/**
 * Linear fulfillment progression for active orders.
 * Agents and Admins advance one step at a time along this sequence.
 */
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.CONFIRMED,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

/**
 * Returns the next valid status in the fulfillment pipeline, or null if terminal.
 */
export function getNextOrderStatus(status: OrderStatus): OrderStatus | null {
  if (status === OrderStatus.CANCELLED || status === OrderStatus.DELIVERED) {
    return null;
  }
  const idx = ORDER_STATUS_FLOW.indexOf(status);
  if (idx === -1 || idx >= ORDER_STATUS_FLOW.length - 1) {
    return null;
  }
  return ORDER_STATUS_FLOW[idx + 1];
}

export function getAdvanceStatusButtonLabel(nextStatus: OrderStatus): string {
  switch (nextStatus) {
    case OrderStatus.CONFIRMED:
      return 'Mark as Confirmed';
    case OrderStatus.PACKED:
      return 'Mark as Packed';
    case OrderStatus.SHIPPED:
      return 'Mark as Shipped';
    case OrderStatus.DELIVERED:
      return 'Mark as Delivered';
    default:
      return `Mark as ${nextStatus}`;
  }
}

export interface CancellationEligibility {
  allowed: boolean;
  requiresApproval: boolean;
  reasonMessage: string;
  activeItemsCount: number;
}

/**
 * Evaluates whether a customer can cancel an order (or remaining active items in it)
 * under the exact COCS cancellation policy and current admin settings.
 *
 * Rules:
 * 1. CANCELLED: Never cancellable again (prevents duplicate refunds).
 * 2. SHIPPED or DELIVERED: Cancellation is strictly disallowed.
 * 3. PLACED or CONFIRMED: Allowed, auto-approved, full refund for selected items.
 * 4. PACKED:
 *    - If settings.allowCancelPacked is false -> disallowed.
 *    - If settings.allowCancelPacked is true & settings.packedNeedsAgentApproval is true
 *      -> allowed, stays PENDING until a Support Agent approves.
 *    - If settings.allowCancelPacked is true & settings.packedNeedsAgentApproval is false
 *      -> allowed, auto-approved immediately.
 * 5. Partial cancellation guard: at least one ACTIVE item must remain to cancel.
 */
export function evaluateCancellationEligibility(
  order: Order,
  settings: AppSettings
): CancellationEligibility {
  const activeItems = order.items.filter((i) => i.status === OrderItemStatus.ACTIVE);
  const pendingItems = order.items.filter(
    (i) => i.status === OrderItemStatus.PENDING_CANCELLATION
  );

  if (order.status === OrderStatus.CANCELLED) {
    return {
      allowed: false,
      requiresApproval: false,
      reasonMessage:
        'This order has already been cancelled. Duplicate cancellations and duplicate refunds are not permitted.',
      activeItemsCount: 0,
    };
  }

  if (order.status === OrderStatus.SHIPPED) {
    return {
      allowed: false,
      requiresApproval: false,
      reasonMessage:
        'This order has already shipped and can no longer be cancelled. Please contact support after delivery if you need assistance.',
      activeItemsCount: activeItems.length,
    };
  }

  if (order.status === OrderStatus.DELIVERED) {
    return {
      allowed: false,
      requiresApproval: false,
      reasonMessage:
        'Delivered orders cannot be cancelled. You may remove this order from your history once you no longer need it.',
      activeItemsCount: activeItems.length,
    };
  }

  if (activeItems.length === 0) {
    if (pendingItems.length > 0) {
      return {
        allowed: false,
        requiresApproval: true,
        reasonMessage:
          'All remaining items on this order already have a pending cancellation request awaiting Support Agent review.',
        activeItemsCount: 0,
      };
    }
    return {
      allowed: false,
      requiresApproval: false,
      reasonMessage: 'No active items remain on this order to cancel.',
      activeItemsCount: 0,
    };
  }

  if (
    order.status === OrderStatus.PLACED ||
    order.status === OrderStatus.CONFIRMED
  ) {
    return {
      allowed: true,
      requiresApproval: false,
      reasonMessage:
        'Eligible for instant cancellation. Requests for Placed and Confirmed orders are auto-approved with a full refund for selected items.',
      activeItemsCount: activeItems.length,
    };
  }

  if (order.status === OrderStatus.PACKED) {
    if (!settings.allowCancelPacked) {
      return {
        allowed: false,
        requiresApproval: false,
        reasonMessage:
          'This order is already packed for dispatch. Current store policy does not allow cancelling packed orders.',
        activeItemsCount: activeItems.length,
      };
    }

    if (settings.packedNeedsAgentApproval) {
      return {
        allowed: true,
        requiresApproval: true,
        reasonMessage:
          'This order is packed. Your cancellation request will be submitted for Support Agent approval before a refund is issued.',
        activeItemsCount: activeItems.length,
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      reasonMessage:
        'Eligible for instant cancellation under current packed-order store policy. Full refund will be initiated immediately.',
      activeItemsCount: activeItems.length,
    };
  }

  return {
    allowed: false,
    requiresApproval: false,
    reasonMessage: 'This order cannot be cancelled in its current status.',
    activeItemsCount: activeItems.length,
  };
}

/**
 * Customer can edit the shipping address ONLY while the order is PLACED or CONFIRMED.
 */
export function canCustomerEditAddress(order: Order): boolean {
  return (
    order.status === OrderStatus.PLACED || order.status === OrderStatus.CONFIRMED
  );
}

/**
 * Customer can soft-delete an order from their history ONLY when CANCELLED or DELIVERED.
 * Active orders (PLACED through SHIPPED) cannot be deleted; customer must cancel first.
 */
export function canCustomerSoftDeleteOrder(order: Order): boolean {
  return (
    order.status === OrderStatus.CANCELLED ||
    order.status === OrderStatus.DELIVERED
  );
}

/**
 * Role-based access helper defining which views each role is permitted to access.
 */
export const ROLE_ALLOWED_VIEWS: Record<UserRole, string[]> = {
  [UserRole.CUSTOMER]: [
    'shop',
    'cart',
    'my-orders',
    'order-details',
    'cancel-order',
    'my-cancellations',
    'notifications',
  ],
  [UserRole.AGENT]: [
    'agent-pending',
    'all-orders',
    'order-details',
    'all-cancellations',
  ],
  [UserRole.ADMIN]: [
    'admin-dashboard',
    'all-orders',
    'order-details',
    'all-cancellations',
    'admin-products',
    'admin-users',
    'admin-reports',
    'admin-audit',
    'admin-settings',
  ],
};

export function getDefaultViewForRole(role: UserRole):
  | 'shop'
  | 'agent-pending'
  | 'admin-dashboard' {
  switch (role) {
    case UserRole.ADMIN:
      return 'admin-dashboard';
    case UserRole.AGENT:
      return 'agent-pending';
    case UserRole.CUSTOMER:
    default:
      return 'shop';
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatShortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}
