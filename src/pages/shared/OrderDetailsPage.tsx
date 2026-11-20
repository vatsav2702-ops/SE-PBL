import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Edit3,
  MapPin,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  AppSettings,
  Cancellation,
  Order,
  OrderStatus,
  Payment,
  RefundStatus,
  UserRole,
} from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  canCustomerEditAddress,
  canCustomerSoftDeleteOrder,
  DEFAULT_SETTINGS,
  evaluateCancellationEligibility,
  formatCurrency,
  formatDateTime,
  getAdvanceStatusButtonLabel,
  getNextOrderStatus,
  ORDER_STATUS_FLOW,
} from '../../rules/cancellationRules';
import {
  CancellationStatusBadge,
  OrderItemStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  RefundStatusBadge,
} from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ProductImage } from '../../components/ProductImage';

interface OrderDetailsPageProps {
  orderId: string;
  onBack: () => void;
  onCancelOrder: (orderId: string) => void;
}

export function OrderDetailsPage({
  orderId,
  onBack,
  onCancelOrder,
}: OrderDetailsPageProps) {
  const { user, dataVersion, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Address edit state (Customer only on PLACED/CONFIRMED)
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);

  // Operational action loading states
  const [advancing, setAdvancing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Delete modals
  const [softDeleteOpen, setSoftDeleteOpen] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [ord, pay, cancels, cfg] = await Promise.all([
          db.getOrderById(orderId, user),
          db.getPaymentByOrderId(orderId, user),
          db.getCancellationsByOrderId(orderId, user),
          db.getSettings(),
        ]);
        if (!active) return;
        if (!ord) {
          setError('Order not found or was permanently removed.');
          return;
        }
        setOrder(ord);
        setAddressDraft(ord.shippingAddress);
        setPayment(pay);
        setCancellations(cancels);
        setSettings(cfg);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Unable to load order details.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [orderId, user, dataVersion]);

  const eligibility = useMemo(
    () => (order ? evaluateCancellationEligibility(order, settings) : null),
    [order, settings]
  );

  const nextStatus = order ? getNextOrderStatus(order.status) : null;
  const isStaff =
    user?.role === UserRole.AGENT || user?.role === UserRole.ADMIN;
  const isCustomer = user?.role === UserRole.CUSTOMER;
  const isAdmin = user?.role === UserRole.ADMIN;

  const handleSaveAddress = async () => {
    if (!user || !order) return;
    if (addressDraft.trim().length < 10) {
      showToast({
        type: 'error',
        title: 'Invalid address',
        description: 'Shipping address must be at least 10 characters.',
      });
      return;
    }
    setSavingAddress(true);
    try {
      const updated = await db.updateOrderAddress(order.id, addressDraft, user);
      setOrder(updated);
      setEditingAddress(false);
      triggerRefresh();
      showToast({
        type: 'success',
        title: 'Shipping address updated',
        description: `Updated delivery address for ${order.id}.`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Address update failed',
        description: err instanceof Error ? err.message : 'Cannot update address.',
      });
    } finally {
      setSavingAddress(false);
    }
  };

  const handleAdvanceStatus = async () => {
    if (!user || !order || advancing) return;
    setAdvancing(true);
    try {
      const updated = await db.advanceOrderStatus(order.id, user);
      setOrder(updated);
      triggerRefresh();
      showToast({
        type: 'success',
        title: `${order.id} marked as ${updated.status}`,
        description: 'Customer has been notified.',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Cannot advance status',
        description: err instanceof Error ? err.message : 'Action failed.',
      });
    } finally {
      setAdvancing(false);
    }
  };

  const handleRetryRefund = async (cancellationId: string) => {
    if (!user || retryingId) return;
    setRetryingId(cancellationId);
    try {
      const res = await db.retryRefund(cancellationId, user);
      triggerRefresh();
      if (res.success) {
        showToast({
          type: 'success',
          title: 'Refund settled',
          description: `Refund for ${cancellationId} succeeded on attempt #${res.cancellation.refundAttempts}.`,
        });
      } else {
        showToast({
          type: 'warning',
          title: 'Gateway retry failed',
          description:
            res.cancellation.lastRefundError ||
            'Payment gateway failed again. Please retry.',
        });
      }
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Retry failed',
        description: err instanceof Error ? err.message : 'Unable to retry refund.',
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleSoftDelete = async () => {
    if (!user || !order) return;
    const removedId = order.id;
    setDeleting(true);
    try {
      await db.softDeleteOrder(removedId, user);
      setSoftDeleteOpen(false);
      triggerRefresh();
      showToast({
        type: 'info',
        title: `Removed ${removedId} from your order history`,
        description: 'Click Undo within 5 seconds to restore it.',
        durationMs: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            await db.restoreSoftDeletedOrder(removedId, user);
            triggerRefresh();
            showToast({
              type: 'success',
              title: `Restored ${removedId}`,
            });
          },
        },
      });
      onBack();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Cannot delete order.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleHardDelete = async () => {
    if (!user || !order) return;
    setDeleting(true);
    try {
      await db.hardDeleteOrder(order.id, user);
      setHardDeleteOpen(false);
      triggerRefresh();
      showToast({
        type: 'success',
        title: `Permanently deleted ${order.id}`,
        description: 'Order, payment, and cancellation records were removed.',
      });
      onBack();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Hard delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete.',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading order details...
      </div>
    );
  }

  if (error || !order || !eligibility) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-red-700">
          {error || 'Order not available.'}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          Back to Orders
        </button>
      </div>
    );
  }

  const currentFlowIndex = ORDER_STATUS_FLOW.indexOf(order.status);

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h2 className="font-mono text-xl font-bold text-[#0f2547]">
              {order.id}
            </h2>
            <OrderStatusBadge status={order.status} />
            {order.isDeleted && (
              <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Hidden by Customer
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Placed {formatDateTime(order.createdAt)} · Customer: {order.customerName} (
            {order.customerEmail})
          </p>
        </div>

        {/* Contextual Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isStaff && nextStatus && (
            <button
              type="button"
              disabled={advancing}
              onClick={handleAdvanceStatus}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f2547] px-4 py-2 text-xs font-semibold text-white hover:bg-[#17345e] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <span>
                {advancing ? 'Updating...' : getAdvanceStatusButtonLabel(nextStatus)}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {isCustomer && eligibility.allowed && (
            <button
              type="button"
              onClick={() => onCancelOrder(order.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <XCircle className="h-4 w-4" />
              Cancel Order
            </button>
          )}

          {isCustomer && canCustomerSoftDeleteOrder(order) && !order.isDeleted && (
            <button
              type="button"
              onClick={() => setSoftDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove from History
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setHardDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Permanently Delete
            </button>
          )}
        </div>
      </div>

      {/* Customer Cancellation Status Notice when Blocked */}
      {isCustomer && !eligibility.allowed && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <div>
            <p className="font-semibold text-slate-900">
              Cancellation Unavailable
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              {eligibility.reasonMessage}
            </p>
          </div>
        </div>
      )}

      {/* Status Timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="font-display text-sm font-bold text-slate-900">
          Fulfillment Timeline
        </h3>

        {order.status === OrderStatus.CANCELLED ? (
          <div className="mt-4 space-y-3">
            {order.statusHistory.map((entry, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    entry.status === OrderStatus.CANCELLED
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {entry.status === OrderStatus.CANCELLED ? '✕' : '✓'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {entry.status}{' '}
                    <span className="font-normal text-xs text-slate-500">
                      · {formatDateTime(entry.timestamp)} · {entry.actorName}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600">{entry.note}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {ORDER_STATUS_FLOW.map((step, idx) => {
                const completed = idx <= currentFlowIndex;
                const isCurrent = idx === currentFlowIndex;
                const historyItem = order.statusHistory.find(
                  (h) => h.status === step
                );

                return (
                  <div
                    key={step}
                    className={`rounded-lg border p-3 ${
                      isCurrent
                        ? 'border-blue-600 bg-blue-50/50'
                        : completed
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                          completed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {completed ? <Check className="h-3 w-3" /> : idx + 1}
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          completed ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {historyItem
                        ? formatDateTime(historyItem.timestamp)
                        : 'Pending'}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Items + Shipping & Payment */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Line Items Table */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Order Items ({order.items.length})
            </h3>
            <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
              Total: {formatCurrency(order.totalAmount)}
            </span>
          </div>

          <ul className="divide-y divide-slate-100">
            {order.items.map((item) => (
              <li
                key={item.itemId}
                className="flex items-center gap-4 px-5 py-4"
              >
                <ProductImage
                  src={item.productImage}
                  alt={item.productName}
                  className="h-14 w-16 shrink-0 rounded-lg border border-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.productName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums">
                      {formatCurrency(item.unitPrice)} × {item.quantity}
                    </span>
                    <OrderItemStatusBadge status={item.status} />
                  </div>
                </div>
                <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {formatCurrency(item.unitPrice * item.quantity)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Shipping Address & Payment Info */}
        <div className="lg:col-span-5 space-y-5">
          {/* Shipping Address */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                <MapPin className="h-4 w-4 text-[#0f2547]" />
                Shipping Address
              </h3>
              {isCustomer && canCustomerEditAddress(order) && !editingAddress && (
                <button
                  type="button"
                  onClick={() => {
                    setAddressDraft(order.shippingAddress);
                    setEditingAddress(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Address
                </button>
              )}
            </div>

            {editingAddress ? (
              <div className="mt-3 space-y-3">
                <textarea
                  rows={3}
                  value={addressDraft}
                  onChange={(e) => setAddressDraft(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingAddress(false)}
                    disabled={savingAddress}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingAddress}
                    onClick={handleSaveAddress}
                    className="rounded-lg bg-[#0f2547] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer disabled:opacity-50"
                  >
                    {savingAddress ? 'Saving...' : 'Save Address'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-700">
                  {order.shippingAddress}
                </p>
                {isCustomer && !canCustomerEditAddress(order) && (
                  <p className="mt-2 text-xs text-slate-400">
                    Address editing is locked once an order reaches PACKED status or beyond.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Payment Information */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                <CreditCard className="h-4 w-4 text-[#0f2547]" />
                Payment & Refund Summary
              </h3>
              {payment && <PaymentStatusBadge status={payment.status} />}
            </div>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Method</dt>
                <dd className="font-medium text-slate-900">
                  {order.paymentMethod}
                </dd>
              </div>
              {payment && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Transaction Ref</dt>
                  <dd className="font-mono text-xs font-medium text-slate-700">
                    {payment.transactionRef}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Original Total</dt>
                <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(order.totalAmount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Active Value</dt>
                <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(order.activeAmount)}
                </dd>
              </div>
              {payment && payment.refundedAmount > 0 && (
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <dt className="font-medium text-emerald-700">Total Refunded</dt>
                  <dd className="font-mono font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(payment.refundedAmount)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Cancellation & Refund Records */}
      {cancellations.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Cancellation & Refund Records ({cancellations.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {cancellations.map((c) => (
              <div key={c.id} className="p-5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#0f2547]">
                      {c.id}
                    </span>
                    <CancellationStatusBadge status={c.status} />
                    <RefundStatusBadge status={c.refundStatus} />
                    <span className="text-xs text-slate-500">
                      {c.isPartial ? 'Partial' : 'Full'} · {formatDateTime(c.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {formatCurrency(c.refundAmount)}
                    </span>
                    {isStaff &&
                      c.status === 'APPROVED' &&
                      c.refundStatus === RefundStatus.REFUND_PENDING && (
                        <button
                          type="button"
                          disabled={retryingId === c.id}
                          onClick={() => handleRetryRefund(c.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f2547] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${
                              retryingId === c.id ? 'animate-spin' : ''
                            }`}
                          />
                          {retryingId === c.id ? 'Retrying...' : 'Retry Refund'}
                        </button>
                      )}
                  </div>
                </div>

                <p className="text-xs text-slate-700">
                  <span className="font-semibold">Reason:</span> {c.reason}
                  {c.comments ? ` — "${c.comments}"` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  Items: {c.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                </p>
                {c.rejectReason && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    Rejected by {c.processedBy}: {c.rejectReason}
                  </p>
                )}
                {c.lastRefundError &&
                  c.refundStatus === RefundStatus.REFUND_PENDING && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      Last gateway error (Attempt #{c.refundAttempts}): {c.lastRefundError}
                    </p>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Soft Delete Dialog */}
      <ConfirmDialog
        open={softDeleteOpen}
        title={`Remove ${order.id} from your history?`}
        description="This hides the order from your My Orders page. You will have 5 seconds to undo. Audit logs and reports remain intact."
        confirmLabel="Remove from History"
        variant="danger"
        loading={deleting}
        onConfirm={handleSoftDelete}
        onCancel={() => setSoftDeleteOpen(false)}
      />

      {/* Admin Hard Delete Dialog (Requires typing exact Order ID) */}
      <ConfirmDialog
        open={hardDeleteOpen}
        title={`Permanently delete ${order.id}?`}
        description="This irreversible administrator action permanently deletes the order along with its linked payment and cancellation records. An audit log entry will be recorded."
        confirmLabel="Permanently Delete Order"
        variant="danger"
        requiredMatchText={order.id}
        requiredMatchLabel={`Type ${order.id} to confirm permanent deletion`}
        loading={deleting}
        onConfirm={handleHardDelete}
        onCancel={() => setHardDeleteOpen(false)}
      />
    </div>
  );
}
