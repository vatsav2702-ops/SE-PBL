import React, { useEffect, useState } from 'react';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { Product } from '../../types';
import * as db from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../rules/cancellationRules';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ProductImage } from '../../components/ProductImage';

const DEFAULT_STUDIO_IMAGES = [
  {
    label: 'Headphones Studio',
    url: '/src/assets/images/product_anc_headphones_1795186138011.jpg',
  },
  {
    label: 'Mechanical Keyboard',
    url: '/src/assets/images/product_mech_keyboard_1795186100168.jpg',
  },
  {
    label: 'Architectural Lamp',
    url: '/src/assets/images/product_desk_lamp_1795186068827.jpg',
  },
  {
    label: 'Titanium Watch',
    url: '/src/assets/images/product_titanium_watch_1795186072522.jpg',
  },
  {
    label: 'Commuter Backpack',
    url: '/src/assets/images/product_tech_backpack_1795186073105.jpg',
  },
  {
    label: 'Pour-Over Kettle',
    url: '/src/assets/images/product_pourover_kettle_1795186068450.jpg',
  },
];

export function ManageProductsPage() {
  const { user, dataVersion, triggerRefresh } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal for Add/Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('Workspace');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('10');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState(DEFAULT_STUDIO_IMAGES[0].url);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const openAdd = () => {
    setEditing(null);
    setName('');
    setSku('');
    setCategory('Workspace');
    setPrice('');
    setStock('10');
    setDescription('');
    setImageUrl(DEFAULT_STUDIO_IMAGES[0].url);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setName(p.name);
    setSku(p.sku);
    setCategory(p.category);
    setPrice(String(p.price));
    setStock(String(p.stock));
    setDescription(p.description);
    setImageUrl(p.imageUrl);
    setFormError('');
    setModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;
    setFormError('');

    const parsedPrice = Number(price);
    const parsedStock = Number(stock);
    if (!name.trim()) {
      setFormError('Product name is required.');
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setFormError('Enter a valid price greater than ₹0.');
      return;
    }
    if (isNaN(parsedStock) || parsedStock < 0 || !Number.isInteger(parsedStock)) {
      setFormError('Stock must be a non-negative whole number.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await db.updateProduct(
          editing.id,
          {
            name,
            sku,
            category,
            price: parsedPrice,
            stock: parsedStock,
            description,
            imageUrl,
          },
          user
        );
        showToast({
          type: 'success',
          title: 'Product updated',
          description: `"${name.trim()}" saved successfully.`,
        });
      } else {
        await db.createProduct(
          {
            name,
            sku,
            category,
            price: parsedPrice,
            stock: parsedStock,
            description,
            imageUrl,
          },
          user
        );
        showToast({
          type: 'success',
          title: 'Product created',
          description: `"${name.trim()}" added to the storefront.`,
        });
      }
      setModalOpen(false);
      triggerRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStock = async (p: Product, delta: number) => {
    if (!user) return;
    const nextStock = Math.max(0, p.stock + delta);
    if (nextStock === p.stock) return;
    try {
      await db.updateProduct(p.id, { stock: nextStock }, user);
      triggerRefresh();
      showToast({
        type: 'success',
        title: 'Stock updated',
        description: `${p.name} stock is now ${nextStock}.`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Stock update failed',
        description: err instanceof Error ? err.message : 'Unable to update stock.',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      await db.deleteProduct(deleteTarget.id, user);
      const removedName = deleteTarget.name;
      setDeleteTarget(null);
      triggerRefresh();
      showToast({
        type: 'success',
        title: 'Product deleted',
        description: `"${removedName}" was removed from the catalog.`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete product.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, SKU, or category..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f2547] px-4 py-2 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading catalog...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category / SKU</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-center">Stock Control</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-11 w-14 shrink-0 rounded-md border border-slate-200"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {p.name}
                          </p>
                          <p className="max-w-xs truncate text-[11px] text-slate-500">
                            {p.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      <p className="font-medium text-slate-800">{p.category}</p>
                      <p className="font-mono text-[11px] text-slate-500">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                      {formatCurrency(p.price)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={p.stock <= 0}
                          onClick={() => handleQuickStock(p, -1)}
                          className="h-7 w-7 rounded border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        >
                          -
                        </button>
                        <span
                          className={`min-w-[40px] text-center font-mono text-xs font-bold tabular-nums ${
                            p.stock === 0
                              ? 'text-red-600'
                              : p.stock <= 5
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {p.stock}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickStock(p, 1)}
                          className="h-7 w-7 rounded border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-slate-900">
                {editing ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    SKU
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Auto-generated if blank"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Price (INR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Stock Quantity *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Studio Image Preset
                </label>
                <select
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {DEFAULT_STUDIO_IMAGES.map((img) => (
                    <option key={img.url} value={img.url}>
                      {img.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0f2547] px-4 py-2 text-xs font-semibold text-white hover:bg-[#17345e] cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This removes the product from the store catalog. Existing historical orders referencing this product remain intact."
        confirmLabel="Delete Product"
        variant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
