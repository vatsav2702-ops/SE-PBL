import { useEffect, useState } from 'react';
import { Eye, XCircle } from 'lucide-react';
import { Cancellation } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDateTime } from '../../rules/cancellationRules';
import {
  CancellationStatusBadge,
  RefundStatusBadge,
} from '../../components/StatusBadge';

interface MyCancellationsPageProps {
  onViewOrder: (orderId: string) => void;
}

export function MyCancellationsPage({ onViewOrder }: MyCancellationsPageProps) {
  const { user, dataVersion } = useAuth();
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const list = await db.getCancellations(user);
        if (active) setCancellations(list);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, dataVersion]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading your cancellation history...
      </div>
    );
  }

  if (cancellations.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <XCircle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-base font-bold text-slate-900">
          No cancellation requests
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          When you cancel an order or individual items, your request status and
          refund tracking will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cancellations.map((c) => (
        <div
          key={c.id}
          className="rounded-xl border border-slate-200 bg-white p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#0f2547]">
                  {c.id}
                </span>
                <span className="text-xs text-slate-400">·</span>
                <span className="font-mono text-xs font-semibold text-slate-700">
                  {c.orderId}
                </span>
                <CancellationStatusBadge status={c.status} />
                <RefundStatusBadge status={c.refundStatus} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Submitted {formatDateTime(c.createdAt)} ·{' '}
                {c.isPartial ? 'Partial Cancellation' : 'Full Order Cancellation'} ·
                Order was {c.orderStatusAtRequest}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-left sm:text-right">
                <p className="text-[11px] font-medium text-slate-500">
                  Refund Amount
                </p>
                <p className="font-mono text-base font-bold text-slate-900 tabular-nums">
                  {formatCurrency(c.refundAmount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onViewOrder(c.orderId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <Eye className="h-3.5 w-3.5" />
                View Order
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Cancelled Items
              </p>
              <ul className="mt-1 space-y-1">
                {c.items.map((item) => (
                  <li
                    key={item.itemId}
                    className="flex items-center justify-between text-xs text-slate-700"
                  >
                    <span>
                      {item.productName} × {item.quantity}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500">
                Reason & Status Notes
              </p>
              <p className="mt-1 text-xs font-medium text-slate-800">
                {c.reason}
              </p>
              {c.comments && (
                <p className="mt-0.5 text-xs text-slate-600">“{c.comments}”</p>
              )}
              {c.rejectReason && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  Rejection Reason: {c.rejectReason}
                </p>
              )}
              {c.refundStatus === 'REFUND_PENDING' && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  Payment gateway temporarily failed to settle refund. Our support
                  team has been notified to retry.
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
