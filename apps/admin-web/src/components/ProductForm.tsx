import { useEffect, useState } from "react";
import type { Product, ProductInput } from "@/types/product";

type Props = {
  initial?: Product | null;
  onSubmit: (input: ProductInput) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
};

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

const empty: ProductInput = {
  name: "",
  description: "",
  price: 0,
  stock: 0,
  category: "",
};

export default function ProductForm({ initial, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const [form, setForm] = useState<ProductInput>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      const { name, description, price, stock, category } = initial;
      setForm({ name, description, price, stock, category });
    } else {
      setForm(empty);
    }
  }, [initial]);

  const update = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <Field label="Name">
        <input
          required
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Description">
        <textarea
          required
          rows={3}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          className={`${inputClass} resize-none`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Price (USD)">
          <input
            required
            type="number"
            step="0.01"
            min={0}
            value={form.price}
            onChange={(e) => update("price", Number(e.target.value))}
            className={inputClass}
          />
        </Field>

        <Field label="Stock">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={form.stock}
            onChange={(e) => update("stock", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Category">
        <input
          required
          value={form.category}
          onChange={(e) => update("category", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>

    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
