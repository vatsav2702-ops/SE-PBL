import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, XCircle } from 'lucide-react';
import { Cancellation, CancellationStatus, RefundStatus } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDateTime } from '../../rules/cancellationRules';
import {
  CancellationStatusBadge,
  OrderStatusBadge,
} from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface PendingRequestsPageProps {
  onViewOrder: (orderId: string) => void;
}

export function PendingRequestsPage({ onViewOrder }: PendingRequestsPageProps) {
  const { user, dataVersion, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [pending, setPending] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState<Cancellation | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Cancellation | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const list = await db.getCancellations(user);
        if (active) {
          setPending(list.filter((c) => c.status === CancellationStatus.PENDING));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, dataVersion]);

  const handleApprove = async () => {
    if (!user || !approveTarget || processing) return;
    setProcessing(true);
    try {
      const res = await db.approveCancellation(approveTarget.id, user);
      setApproveTarget(null);
      triggerRefresh();
      if (res.cancellation.refundStatus === RefundStatus.REFUND_PENDING) {
        showToast({
          type: 'warning',
          title: `Approved ${res.cancellation.id} — Refund Pending Retry`,
          description:
            'Items were restocked, but the mock payment gateway failed. Use All Cancellations to retry the refund.',
        });
      } else {
        showToast({
          type: 'success',
          title: `Approved ${res.cancellation.id}`,
          description: `Refunded ${formatCurrency(
            res.cancellation.refundAmount
          )} and restocked items.`,
        });
      }
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Approval failed',
        description: err instanceof Error ? err.message : 'Unable to approve request.',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (rejectReason?: string) => {
    if (!user || !rejectTarget || !rejectReason || processing) return;
    setProcessing(true);
    try {
      await db.rejectCancellation(rejectTarget.id, rejectReason, user);
      setRejectTarget(null);
      triggerRefresh();
      showToast({
        type: 'info',
        title: `Rejected ${rejectTarget.id}`,
        description: 'Order items were restored to Active and the customer was notified.',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Rejection failed',
        description: err instanceof Error ? err.message : 'Unable to reject request.',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading pending cancellation queue...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-display text-base font-bold text-slate-900">
          Pending Cancellation Requests ({pending.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Packed orders require Support Agent approval before restocking inventory and
          triggering a refund. Rejecting requires a clear explanation sent directly to the customer.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <ClipboardCheck className="mx-auto h-9 w-9 text-emerald-600" />
          <h3 className="mt-3 font-display text-base font-bold text-slate-900">
            Queue is clear
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            There are no pending packed-order cancellation requests waiting for review.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((req) => (
            <div
              key={req.id}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#0f2547]">
                      {req.id}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="font-mono text-xs font-semibold text-slate-700">
                      {req.orderId}
                    </span>
                    <OrderStatusBadge status={req.orderStatusAtRequest} />
                    <CancellationStatusBadge status={req.status} />
                  </div>

                  <p className="text-sm font-medium text-slate-900">
                    Customer: {req.customerName}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      · Requested {formatDateTime(req.createdAt)} ·{' '}
                      {req.isPartial ? 'Partial Order' : 'Full Order'}
                    </span>
                  </p>

                  <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-900">Reason:</span>{' '}
                      {req.reason}
                    </p>
                    {req.comments && (
                      <p className="mt-1 text-slate-600">
                        <span className="font-semibold text-slate-800">Comments:</span> “
                        {req.comments}”
                      </p>
                    )}
                    <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                      {req.items.map((item) => (
                        <li
                          key={item.itemId}
                          className="flex items-center justify-between"
                        >
                          <span>
                            {item.productName} × {item.quantity}
                          </span>
                          <span className="font-mono font-semibold tabular-nums">
                            {formatCurrency(item.subtotal)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-3 lg:items-end shrink-0">
                  <div className="text-left lg:text-right">
                    <p className="text-[11px] font-medium text-slate-500">
                      Refund if Approved
                    </p>
                    <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                      {formatCurrency(req.refundAmount)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onViewOrder(req.orderId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Order
                    </button>
                    <button
                      type="button"
                      onClick={() => setApproveTarget(req)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectTarget(req)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve Confirmation */}
      <ConfirmDialog
        open={Boolean(approveTarget)}
        title={`Approve cancellation ${approveTarget?.id}?`}
        description={`Approving will cancel the selected item(s) on ${approveTarget?.orderId}, return quantities to stock, and initiate a refund of ${formatCurrency(
          approveTarget?.refundAmount || 0
        )}.`}
        confirmLabel="Approve & Issue Refund"
        variant="primary"
        loading={processing}
        onConfirm={handleApprove}
        onCancel={() => setApproveTarget(null)}
      />

      {/* Reject Confirmation with Mandatory Reason */}
      <ConfirmDialog
        open={Boolean(rejectTarget)}
        title={`Reject cancellation ${rejectTarget?.id}?`}
        description={`Provide a clear rejection reason for ${rejectTarget?.customerName}. The selected items will return to Active status so fulfillment can continue.`}
        confirmLabel="Reject Request"
        variant="danger"
        inputRequired
        inputLabel="Rejection Reason (Mandatory)"
        inputPlaceholder="e.g., Package has already been loaded onto the carrier pallet."
        inputMinLength={5}
        loading={processing}
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  );
}
