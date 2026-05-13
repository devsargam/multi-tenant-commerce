export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = Omit<Product, "id" | "createdAt" | "updatedAt">;
