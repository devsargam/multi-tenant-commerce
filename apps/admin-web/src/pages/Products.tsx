import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import ProductForm from "@/components/ProductForm";
import { api } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import type { Product, ProductInput } from "@/types/product";

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await api.listProducts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [products, search]);

  const handleCreate = async (input: ProductInput) => {
    const created = await api.createProduct(input);
    setProducts((prev) => [created, ...prev]);
    setCreating(false);
  };

  const handleUpdate = async (input: ProductInput) => {
    if (!editing) return;
    const updated = await api.updateProduct(editing.id, input);
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditing(null);
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.deleteProduct(p.id);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New product
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Stock</th>
              <th className="px-5 py-3 font-medium">Updated</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                  No products found.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="line-clamp-1 text-xs text-slate-500">
                      {p.description}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {p.category}
                    </span>
                  </td>
                  <td className="px-5 py-3">{formatPrice(p.price)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        p.stock < 20
                          ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700"
                          : "text-slate-700"
                      }
                    >
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {formatDate(p.updatedAt)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditing(p)}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal open={creating} title="New product" onClose={() => setCreating(false)}>
        <ProductForm
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
          submitLabel="Create"
        />
      </Modal>

      <Modal
        open={editing !== null}
        title={`Edit · ${editing?.name ?? ""}`}
        onClose={() => setEditing(null)}
      >
        <ProductForm
          initial={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
          submitLabel="Save changes"
        />
      </Modal>
    </div>
  );
}
