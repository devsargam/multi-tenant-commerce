import type { Product, ProductInput } from "@/types/product";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listProducts: () => request<Product[]>("/products"),
  getProduct: (id: string) => request<Product>(`/products/${id}`),
  createProduct: (input: ProductInput) =>
    request<Product>("/products", { method: "POST", body: JSON.stringify(input) }),
  updateProduct: (id: string, input: ProductInput) =>
    request<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteProduct: (id: string) =>
    request<void>(`/products/${id}`, { method: "DELETE" }),
};
