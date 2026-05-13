import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types/product";

export default function Dashboard() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listProducts()
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const totalValue =
    products?.reduce((sum, p) => sum + p.price * p.stock, 0) ?? 0;
  const totalStock = products?.reduce((sum, p) => sum + p.stock, 0) ?? 0;
  const lowStock = products?.filter((p) => p.stock < 20).length ?? 0;
  const categories = new Set(products?.map((p) => p.category)).size;

  const stats = [
    { label: "Products", value: products?.length ?? "—" },
    { label: "Inventory value", value: formatPrice(totalValue) },
    { label: "Units in stock", value: totalStock },
    { label: "Low stock (<20)", value: lowStock },
    { label: "Categories", value: categories },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {s.label}
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
          Recent products
        </div>
        <ul className="divide-y divide-slate-100">
          {(products ?? []).slice(0, 5).map((p) => (
            <li key={p.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-slate-500">{p.category}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{formatPrice(p.price)}</div>
                <div className="text-xs text-slate-500">{p.stock} in stock</div>
              </div>
            </li>
          ))}
          {products && products.length === 0 && (
            <li className="px-5 py-6 text-center text-sm text-slate-500">
              No products yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
