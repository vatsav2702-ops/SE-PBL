import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckSquare,
  Info,
  Square,
  XCircle,
} from 'lucide-react';
import { AppSettings, Order, OrderItemStatus, RefundStatus } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  CANCELLATION_REASONS,
  DEFAULT_SETTINGS,
  evaluateCancellationEligibility,
  formatCurrency,
} from '../../rules/cancellationRules';
import {
  OrderItemStatusBadge,
  OrderStatusBadge,
} from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ProductImage } from '../../components/ProductImage';

interface CancelOrderPageProps {
  orderId: string;
  onBack: () => void;
  onCompleted: (orderId: string) => void;
}

export function CancelOrderPage({
  orderId,
  onBack,
  onCompleted,
}: CancelOrderPageProps) {
  const { user, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [ord, cfg] = await Promise.all([
          db.getOrderById(orderId, user),
          db.getSettings(),
        ]);
        if (!active) return;
        if (!ord) {
          setLoadError('Order not found.');
          return;
        }
        setOrder(ord);
        setSettings(cfg);
        const activeIds = ord.items
          .filter((i) => i.status === OrderItemStatus.ACTIVE)
          .map((i) => i.itemId);
        setSelectedItemIds(activeIds);
      } catch (err) {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : 'Unable to load order.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [orderId, user]);

  const eligibility = useMemo(
    () => (order ? evaluateCancellationEligibility(order, settings) : null),
    [order, settings]
  );

  const activeItems = useMemo(
    () =>
      order
        ? order.items.filter((i) => i.status === OrderItemStatus.ACTIVE)
        : [],
    [order]
  );

  const refundPreview = useMemo(() => {
    if (!order) return 0;
    const selectedSet = new Set(selectedItemIds);
    return order.items
      .filter((i) => selectedSet.has(i.itemId))
      .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  }, [order, selectedItemIds]);

  const isCancellingAllRemaining =
    activeItems.length > 0 && selectedItemIds.length === activeItems.length;

  const toggleItem = (itemId: string) => {
    setFormError('');
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    setFormError('');
    if (selectedItemIds.length === activeItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(activeItems.map((i) => i.itemId));
    }
  };

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (selectedItemIds.length === 0) {
      setFormError('Select at least one active item to cancel.');
      return;
    }
    if (!reason) {
      setFormError('Please select a cancellation reason.');
      return;
    }
    setConfirmOpen(true);
  };

  const handleFinalizeCancel = async () => {
    if (!user || !order || submitting) return;
    setSubmitting(true);
    try {
      const result = await db.createCancellationRequest(
        {
          orderId: order.id,
          selectedItemIds,
          reason,
          comments,
        },
        user
      );
      setConfirmOpen(false);
      triggerRefresh();

      if (result.cancellation.status === 'PENDING') {
        showToast({
          type: 'warning',
          title: `Cancellation ${result.cancellation.id} Pending Approval`,
          description:
            'Because this order is PACKED, a Support Agent must review and approve your request.',
        });
      } else if (
        result.cancellation.refundStatus === RefundStatus.REFUND_PENDING
      ) {
        showToast({
          type: 'warning',
          title: 'Cancelled — Refund Pending Retry',
          description: `Cancellation ${result.cancellation.id} was approved, but the payment gateway timed out. Support can retry your ${formatCurrency(
            result.cancellation.refundAmount
          )} refund.`,
        });
      } else {
        showToast({
          type: 'success',
          title: `Cancellation ${result.cancellation.id} Approved`,
          description: `Refund of ${formatCurrency(
            result.cancellation.refundAmount
          )} has been processed and items restocked.`,
        });
      }

      onCompleted(order.id);
    } catch (err) {
      setConfirmOpen(false);
      const msg =
        err instanceof Error ? err.message : 'Unable to process cancellation.';
      setFormError(msg);
      showToast({
        type: 'error',
        title: 'Cancellation failed',
        description: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading cancellation form...
      </div>
    );
  }

  if (loadError || !order || !eligibility) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-red-700">
          {loadError || 'Order unavailable.'}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!eligibility.allowed) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Order Details
        </button>
        <div className="rounded-xl border border-amber-200 bg-white p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Cancellation Not Available for {order.id}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {eligibility.reasonMessage}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Order {order.id}
        </button>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-[#0f2547]">
            {order.id}
          </span>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {/* Policy Banner */}
      <div
        className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
          eligibility.requiresApproval
            ? 'border-amber-200 bg-amber-50/70 text-amber-950'
            : 'border-blue-200 bg-blue-50/70 text-slate-800'
        }`}
      >
        <Info
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            eligibility.requiresApproval ? 'text-amber-600' : 'text-blue-700'
          }`}
        />
        <div>
          <p className="font-semibold">
            {eligibility.requiresApproval
              ? 'Agent Approval Required (Packed Order)'
              : 'Instant Auto-Approval Eligible'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-90">
            {eligibility.reasonMessage}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleOpenConfirm}
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
      >
        {/* Left: Item Selection + Reason */}
        <div className="lg:col-span-7 space-y-5">
          {/* Item Checkboxes for Partial or Full Cancellation */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  1. Select Items to Cancel
                </h2>
                <p className="text-xs text-slate-500">
                  Choose individual items for a partial cancellation or select all
                  items to cancel the full order.
                </p>
              </div>
              {activeItems.length > 1 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
                >
                  {selectedItemIds.length === activeItems.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              )}
            </div>

            <ul className="divide-y divide-slate-100">
              {order.items.map((item) => {
                const isActive = item.status === OrderItemStatus.ACTIVE;
                const checked = selectedItemIds.includes(item.itemId);
                return (
                  <li
                    key={item.itemId}
                    onClick={() => isActive && toggleItem(item.itemId)}
                    className={`flex items-center gap-3.5 px-5 py-4 transition-colors ${
                      isActive
                        ? 'cursor-pointer hover:bg-slate-50'
                        : 'bg-slate-50/70 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="shrink-0 text-[#0f2547]">
                      {isActive ? (
                        checked ? (
                          <CheckSquare className="h-5 w-5 text-blue-700" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-400" />
                        )
                      ) : (
                        <Square className="h-5 w-5 text-slate-300" />
                      )}
                    </div>

                    <ProductImage
                      src={item.productImage}
                      alt={item.productName}
                      className="h-12 w-14 shrink-0 rounded-md border border-slate-200"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {item.productName}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
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
                );
              })}
            </ul>
          </div>

          {/* Mandatory Reason & Optional Comments */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="font-display text-sm font-bold text-slate-900">
              2. Cancellation Reason
            </h2>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Reason <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setFormError('');
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select a reason...</option>
                {CANCELLATION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Additional Comments (Optional)
              </label>
              <textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Share any additional details to help our support team..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        {/* Right: Refund Preview Summary */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-slate-900">
              Refund Preview
            </h2>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Cancellation Type</span>
                <span className="font-semibold text-slate-900">
                  {selectedItemIds.length === 0
                    ? 'None Selected'
                    : isCancellingAllRemaining &&
                      order.items.every(
                        (i) =>
                          i.status === OrderItemStatus.CANCELLED ||
                          selectedItemIds.includes(i.itemId)
                      )
                    ? 'Full Order Cancellation'
                    : 'Partial Cancellation'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Selected Line Items</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {selectedItemIds.length} of {activeItems.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Approval Flow</span>
                <span
                  className={`font-semibold ${
                    eligibility.requiresApproval
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {eligibility.requiresApproval
                    ? 'Pending Agent Approval'
                    : 'Auto-Approved'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Refund Destination</span>
                <span className="font-medium text-slate-900">
                  {order.paymentMethod}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Estimated Refund
                </span>
                <span className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                  {formatCurrency(refundPreview)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Refund equals the exact value of selected items only. Cancelled
                quantities are automatically returned to store inventory upon approval.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || selectedItemIds.length === 0 || !reason}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              <span>
                {submitting
                  ? 'Processing...'
                  : eligibility.requiresApproval
                  ? 'Submit Cancellation Request'
                  : 'Confirm Cancellation & Refund'}
              </span>
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title={
          eligibility.requiresApproval
            ? `Submit cancellation request for ${order.id}?`
            : `Cancel selected items on ${order.id}?`
        }
        description={
          eligibility.requiresApproval
            ? `Your request for ${selectedItemIds.length} item(s) totaling ${formatCurrency(
                refundPreview
              )} will be sent to a Support Agent for review. Reason: "${reason}".`
            : `This will immediately cancel ${selectedItemIds.length} item(s) and initiate a ${formatCurrency(
                refundPreview
              )} refund via ${order.paymentMethod}. This action cannot be undone.`
        }
        confirmLabel={
          eligibility.requiresApproval
            ? 'Submit Request'
            : 'Yes, Cancel & Refund'
        }
        variant="danger"
        loading={submitting}
        onConfirm={handleFinalizeCancel}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
