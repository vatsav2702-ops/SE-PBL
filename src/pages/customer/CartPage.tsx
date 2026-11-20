import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { Order, PaymentMethod, Product } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../rules/cancellationRules';
import { ProductImage } from '../../components/ProductImage';

interface CartPageProps {
  onGoToShop: () => void;
  onViewOrder: (orderId: string) => void;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: PaymentMethod.CARD, label: 'Card', hint: 'Credit or Debit Card' },
  { value: PaymentMethod.UPI, label: 'UPI', hint: 'Instant bank transfer' },
  { value: PaymentMethod.WALLET, label: 'Wallet', hint: 'Stored digital balance' },
  { value: PaymentMethod.COD, label: 'Cash on Delivery', hint: 'Pay upon courier delivery' },
];

export function CartPage({ onGoToShop, onViewOrder }: CartPageProps) {
  const { user, cart, updateCartQuantity, removeFromCart, clearCart, triggerRefresh, dataVersion } =
    useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CARD);
  const [shippingAddress, setShippingAddress] = useState(
    '742 Market Street, Apt 4B, San Francisco, CA 94103'
  );
  const [formError, setFormError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const list = await db.getProducts();
        if (active) setProducts(list);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [dataVersion]);

  const enrichedCart = useMemo(() => {
    return cart
      .map((ci) => {
        const product = products.find((p) => p.id === ci.productId);
        return product ? { ...ci, product } : null;
      })
      .filter((x): x is { productId: string; quantity: number; product: Product } => x !== null);
  }, [cart, products]);

  const subtotal = useMemo(
    () =>
      enrichedCart.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      ),
    [enrichedCart]
  );

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || placing) return;
    setFormError('');

    if (enrichedCart.length === 0) {
      setFormError('Your cart is empty.');
      return;
    }
    if (shippingAddress.trim().length < 10) {
      setFormError('Please enter a full shipping address (at least 10 characters).');
      return;
    }

    setPlacing(true);
    try {
      const created = await db.createOrder(
        {
          items: enrichedCart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
          })),
          paymentMethod,
          shippingAddress,
        },
        user
      );
      await clearCart();
      triggerRefresh();
      setPlacedOrder(created);
      showToast({
        type: 'success',
        title: `Order ${created.id} placed successfully`,
        description: `Total ${formatCurrency(created.totalAmount)} via ${created.paymentMethod}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to place order.';
      setFormError(msg);
      showToast({ type: 'error', title: 'Order failed', description: msg });
    } finally {
      setPlacing(false);
    }
  };

  if (placedOrder) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-emerald-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-slate-900">
          Order Placed Successfully
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Your order has been recorded with status <strong className="text-slate-900">PLACED</strong> and
          inventory has been reserved.
        </p>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Order ID</span>
            <span className="font-mono font-bold text-[#0f2547]">{placedOrder.id}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate-500">Total Charged</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {formatCurrency(placedOrder.totalAmount)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate-500">Payment Method</span>
            <span className="font-medium text-slate-900">{placedOrder.paymentMethod}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onViewOrder(placedOrder.id)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2547] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#17345e] transition-colors cursor-pointer"
          >
            View Order Details
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onGoToShop}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading your cart...
      </div>
    );
  }

  if (enrichedCart.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <ShoppingBag className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-lg font-bold text-slate-900">
          Your cart is empty
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Browse the store catalog and add items to place a new order.
        </p>
        <button
          type="button"
          onClick={onGoToShop}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0f2547] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#17345e] transition-colors cursor-pointer"
        >
          Browse Shop
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Cart Items */}
      <div className="lg:col-span-7 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-base font-bold text-slate-900">
              Cart Items ({enrichedCart.reduce((s, i) => s + i.quantity, 0)})
            </h2>
            <button
              type="button"
              onClick={onGoToShop}
              className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              Add more items
            </button>
          </div>

          <ul className="divide-y divide-slate-100">
            {enrichedCart.map(({ product, quantity }) => (
              <li
                key={product.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
              >
                <ProductImage
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-20 w-24 shrink-0 rounded-lg border border-slate-200"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">
                    {product.category} · <span className="font-mono">{product.sku}</span>
                  </p>
                  <h3 className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                    {product.name}
                  </h3>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-800 tabular-nums">
                    {formatCurrency(product.price)}{' '}
                    <span className="font-sans text-xs font-normal text-slate-500">
                      each · {product.stock} available
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {formatCurrency(product.price * quantity)}
                  </p>

                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          updateCartQuantity(product.id, quantity - 1, product.stock)
                        }
                        className="p-1.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[28px] text-center font-mono text-xs font-semibold tabular-nums">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        disabled={quantity >= product.stock}
                        onClick={() =>
                          updateCartQuantity(product.id, quantity + 1, product.stock)
                        }
                        className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove ${product.name}`}
                      onClick={() => removeFromCart(product.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Checkout Panel */}
      <div className="lg:col-span-5">
        <form
          onSubmit={handlePlaceOrder}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <h2 className="font-display text-base font-bold text-slate-900">
            Checkout & Payment
          </h2>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Shipping Address <span className="text-red-600">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={shippingAddress}
              onChange={(e) => {
                setShippingAddress(e.target.value);
                setFormError('');
              }}
              placeholder="Street address, apartment/suite, city, state, postal code"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Payment Method
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PAYMENT_OPTIONS.map((opt) => {
                const selected = paymentMethod === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPaymentMethod(opt.value)}
                    className={`flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-blue-700 bg-blue-50/60 text-[#0f2547]'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="mt-0.5 text-[11px] text-slate-500">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Items Subtotal</span>
              <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Standard Shipping</span>
              <span className="font-medium text-emerald-700">Free</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-base font-bold text-slate-900">
              <span>Order Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={placing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f2547] px-4 py-3 text-sm font-semibold text-white hover:bg-[#17345e] transition-colors cursor-pointer disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            <span>{placing ? 'Placing Order...' : `Place Order · ${formatCurrency(subtotal)}`}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
