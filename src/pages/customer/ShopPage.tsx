import { useEffect, useMemo, useState } from 'react';
import { Check, Search, ShoppingCart } from 'lucide-react';
import { Product } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../rules/cancellationRules';
import { ProductImage } from '../../components/ProductImage';

interface ShopPageProps {
  onGoToCart: () => void;
}

export function ShopPage({ onGoToCart }: ShopPageProps) {
  const { cart, addToCart, dataVersion } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

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

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === 'All' || p.category === selectedCategory;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const cartQtyById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of cart) map[c.productId] = c.quantity;
    return map;
  }, [cart]);

  const handleAdd = async (product: Product) => {
    try {
      await addToCart(product, 1);
      setJustAddedId(product.id);
      setTimeout(() => setJustAddedId((curr) => (curr === product.id ? null : curr)), 1200);
      showToast({
        type: 'success',
        title: 'Added to cart',
        description: `${product.name} (${formatCurrency(product.price)})`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Cannot add item',
        description: err instanceof Error ? err.message : 'Stock limit reached.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, description, or SKU..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-white text-[#0f2547] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={onGoToCart}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f2547] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#17345e] transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Checkout ({cart.reduce((s, c) => s + c.quantity, 0)})
            </button>
          )}
        </div>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <div className="aspect-[4/3] animate-pulse bg-slate-100" />
              <div className="space-y-2.5 p-5">
                <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-base font-semibold text-slate-900">No matching products found</p>
          <p className="mt-1 text-sm text-slate-500">
            Try clearing your search query or switching to All categories.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSelectedCategory('All');
            }}
            className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => {
            const inCart = cartQtyById[product.id] || 0;
            const outOfStock = product.stock <= 0;
            const atLimit = !outOfStock && inCart >= product.stock;
            const added = justAddedId === product.id;

            return (
              <article
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <ProductImage
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">{product.category}</span>
                    <span className="font-mono text-[11px]">{product.sku}</span>
                  </div>

                  <h2 className="mt-1.5 font-display text-base font-semibold leading-snug text-slate-900">
                    {product.name}
                  </h2>

                  <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-600">
                    {product.description}
                  </p>

                  <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
                    <div>
                      <p className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(product.price)}
                      </p>
                      <p
                        className={`mt-0.5 text-xs font-medium tabular-nums ${
                          outOfStock
                            ? 'text-red-600'
                            : product.stock <= 5
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {outOfStock
                          ? 'Out of stock'
                          : `${product.stock} in stock${inCart > 0 ? ` · ${inCart} in cart` : ''}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={outOfStock || atLimit}
                      onClick={() => handleAdd(product)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        outOfStock || atLimit
                          ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                          : added
                          ? 'bg-emerald-600 text-white cursor-pointer'
                          : 'bg-[#0f2547] text-white hover:bg-[#17345e] cursor-pointer'
                      }`}
                    >
                      {added ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Added
                        </>
                      ) : outOfStock ? (
                        'Out of Stock'
                      ) : atLimit ? (
                        'Max in Cart'
                      ) : (
                        <>
                          <ShoppingCart className="h-3.5 w-3.5" />
                          Add to Cart
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
