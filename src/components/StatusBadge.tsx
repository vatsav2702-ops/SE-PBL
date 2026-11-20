import {
  CancellationStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  UserRole,
} from '../types';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; cls: string }> = {
    [OrderStatus.PLACED]: {
      label: 'Placed',
      cls: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    [OrderStatus.CONFIRMED]: {
      label: 'Confirmed',
      cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    },
    [OrderStatus.PACKED]: {
      label: 'Packed',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    [OrderStatus.SHIPPED]: {
      label: 'Shipped',
      cls: 'bg-sky-50 text-sky-800 border-sky-200',
    },
    [OrderStatus.DELIVERED]: {
      label: 'Delivered',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    [OrderStatus.CANCELLED]: {
      label: 'Cancelled',
      cls: 'bg-red-50 text-red-800 border-red-200',
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export function OrderItemStatusBadge({ status }: { status: OrderItemStatus }) {
  const map: Record<OrderItemStatus, { label: string; cls: string }> = {
    [OrderItemStatus.ACTIVE]: {
      label: 'Active',
      cls: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    [OrderItemStatus.PENDING_CANCELLATION]: {
      label: 'Cancel Pending',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    [OrderItemStatus.CANCELLED]: {
      label: 'Cancelled',
      cls: 'bg-red-50 text-red-800 border-red-200',
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export function CancellationStatusBadge({ status }: { status: CancellationStatus }) {
  const map: Record<CancellationStatus, { label: string; cls: string }> = {
    [CancellationStatus.PENDING]: {
      label: 'Pending Approval',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    [CancellationStatus.APPROVED]: {
      label: 'Approved',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    [CancellationStatus.REJECTED]: {
      label: 'Rejected',
      cls: 'bg-red-50 text-red-800 border-red-200',
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const map: Record<RefundStatus, { label: string; cls: string }> = {
    [RefundStatus.REFUNDED]: {
      label: 'Refunded',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    [RefundStatus.REFUND_PENDING]: {
      label: 'Refund Pending',
      cls: 'bg-red-50 text-red-800 border-red-200',
    },
    [RefundStatus.PENDING_APPROVAL]: {
      label: 'Awaiting Approval',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    [RefundStatus.NOT_APPLICABLE]: {
      label: 'No Refund',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; cls: string }> = {
    [PaymentStatus.PAID]: {
      label: 'Paid',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    [PaymentStatus.COD_PENDING]: {
      label: 'Due on Delivery',
      cls: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    [PaymentStatus.PARTIALLY_REFUNDED]: {
      label: 'Partially Refunded',
      cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    },
    [PaymentStatus.REFUNDED]: {
      label: 'Refunded',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    [PaymentStatus.REFUND_PENDING]: {
      label: 'Refund Pending',
      cls: 'bg-red-50 text-red-800 border-red-200',
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  const map: Record<UserRole, { label: string; cls: string }> = {
    [UserRole.CUSTOMER]: {
      label: 'Customer',
      cls: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    [UserRole.AGENT]: {
      label: 'Support Agent',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    [UserRole.ADMIN]: {
      label: 'Administrator',
      cls: 'bg-slate-900 text-white border-slate-900',
    },
  };
  const cfg = map[role];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
