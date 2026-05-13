import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool, schema } from "./db/client.js";

const {
  addresses,
  cartItems,
  carts,
  categories,
  customers,
  inventoryItems,
  inventoryLocations,
  inventoryMovements,
  orderEvents,
  orderItems,
  orders,
  productCategories,
  productVariants,
  products,
} = schema;

const app = express();
const port = Number(process.env.PORT ?? 3001);
const DEFAULT_SESSION_TOKEN = "demo-session";
const DEFAULT_CURRENCY = "USD";
const SHOULD_AUTO_MIGRATE =
  process.env.NODE_ENV !== "production" && process.env.AUTO_MIGRATE !== "false";
const SHOULD_SEED_DEMO =
  process.env.NODE_ENV !== "production" && process.env.SEED_DEMO_DATA !== "false";
const MIGRATIONS_FOLDER = process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "./drizzle";

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

type UnknownRecord = Record<string, unknown>;

type ProductInput = {
  name: string;
  description: string;
  price?: number;
  priceCents?: number;
  stock: number;
  category: string;
  sku?: string;
  status?: "draft" | "active" | "archived";
};

type SerializedProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  status: "draft" | "active" | "archived";
  category: string;
  sku: string;
  variantId: string;
  price: number;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  currency: string;
  imageTone: string;
  createdAt: string;
  updatedAt: string;
};

type CartLine = {
  product: SerializedProduct;
  quantity: number;
  lineTotalCents: number;
};

type SerializedCart = {
  id: string;
  items: Array<{ productId: string; variantId: string; quantity: number }>;
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
};

type AddressPayload = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type CustomerPayload = {
  name: string;
  email: string;
  phone?: string;
  address: AddressPayload;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const asOptionalString = (value: unknown) => {
  const stringValue = asString(value);
  return stringValue.length > 0 ? stringValue : undefined;
};

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

const toIso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString());

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "item";

const centsToDollars = (cents: number) => cents / 100;

const dollarsToCents = (amount: number) => Math.round(amount * 100);

const imageToneForCategory = (category: string) => {
  const tones = [
    "border-emerald-100 bg-emerald-50 text-emerald-900",
    "border-blue-100 bg-blue-50 text-blue-900",
    "border-violet-100 bg-violet-50 text-violet-900",
    "border-amber-100 bg-amber-50 text-amber-900",
    "border-rose-100 bg-rose-50 text-rose-900",
  ];
  const index =
    [...category].reduce((total, char) => total + char.charCodeAt(0), 0) %
    tones.length;

  return tones[index] ?? tones[0];
};

const sendError = (res: Response, status: number, error: string) => {
  res.status(status).json({ error });
};

const routeParam = (req: Request, key: string) => {
  const value = req.params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => {
    handler(req, res).catch((error: unknown) => {
      console.error(error);
      const cause = error instanceof Error ? error.cause : null;
      const causeMessage =
        cause instanceof Error ? cause.message : isRecord(cause) ? asString(cause.message) : "";
      const errorMessage = error instanceof Error ? error.message : "";
      const missingSchema =
        errorMessage.includes('from "products"') &&
        (causeMessage.includes('relation "products" does not exist') ||
          causeMessage.includes("does not exist"));

      sendError(
        res,
        missingSchema ? 503 : 500,
        missingSchema
          ? "Database schema is not migrated. Run `pnpm --filter api db:migrate` or restart the API with AUTO_MIGRATE enabled."
          : error instanceof Error
            ? error.message
            : "Unexpected API error",
      );
    });
  };

const parseProductInput = (body: unknown): ProductInput | { error: string } => {
  if (!isRecord(body)) {
    return { error: "Expected a JSON object" };
  }

  const name = asString(body.name);
  const description = asString(body.description);
  const category = asString(body.category);
  const stock = asInteger(body.stock);
  const status = asString(body.status) || "active";
  const explicitPriceCents = asInteger(body.priceCents);
  const price = asNumber(body.price);

  if (!name || !description || !category) {
    return { error: "name, description, and category are required" };
  }

  if (stock === null || stock < 0) {
    return { error: "stock must be a non-negative integer" };
  }

  if (explicitPriceCents === null && (price === null || price < 0)) {
    return { error: "price or priceCents must be a non-negative number" };
  }

  if (status !== "draft" && status !== "active" && status !== "archived") {
    return { error: "status must be draft, active, or archived" };
  }

  return {
    name,
    description,
    category,
    stock,
    status,
    sku: asOptionalString(body.sku),
    priceCents: explicitPriceCents ?? dollarsToCents(price ?? 0),
  };
};

const parseAddressPayload = (value: unknown): AddressPayload | null => {
  if (!isRecord(value)) {
    return null;
  }

  const line1 = asString(value.line1);
  const city = asString(value.city);
  const state = asString(value.state) || asString(value.region);
  const postalCode = asString(value.postalCode);
  const country = (asString(value.country) || "US").slice(0, 2).toUpperCase();

  if (!line1 || !city || !state || !postalCode || !country) {
    return null;
  }

  return {
    line1,
    line2: asOptionalString(value.line2),
    city,
    state,
    postalCode,
    country,
  };
};

const parseCustomerPayload = (value: unknown): CustomerPayload | null => {
  if (!isRecord(value)) {
    return null;
  }

  const name =
    asString(value.name) ||
    `${asString(value.firstName)} ${asString(value.lastName)}`.trim();
  const email = asString(value.email).toLowerCase();
  const address = parseAddressPayload(value.address);

  if (!name || !email || !address) {
    return null;
  }

  return {
    name,
    email,
    phone: asOptionalString(value.phone),
    address,
  };
};

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() || "Guest";
  const lastName = parts.join(" ") || "Customer";

  return { firstName, lastName };
};

const getDefaultLocation = async () => {
  const [existing] = await db
    .select()
    .from(inventoryLocations)
    .where(eq(inventoryLocations.isDefault, true))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(inventoryLocations)
    .values({ name: "Default warehouse", isDefault: true })
    .returning();

  return created;
};

const getOrCreateCategory = async (name: string) => {
  const slug = slugify(name);
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(categories)
    .values({ slug, name })
    .returning();

  return created;
};

const getVariantStock = async (variantId: string) => {
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.variantId, variantId));

  return rows.reduce(
    (total, row) => total + (row.available ?? row.onHand - row.reserved),
    0,
  );
};

const setVariantStock = async (variantId: string, stock: number) => {
  const location = await getDefaultLocation();
  const [existing] = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.variantId, variantId),
        eq(inventoryItems.locationId, location.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(inventoryItems)
      .set({ onHand: stock, reserved: 0, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryItems.variantId, variantId),
          eq(inventoryItems.locationId, location.id),
        ),
      );
    return;
  }

  await db.insert(inventoryItems).values({
    variantId,
    locationId: location.id,
    onHand: stock,
    reserved: 0,
    reorderPoint: 10,
  });
};

const getDefaultVariant = async (productId: string, defaultVariantId?: string | null) => {
  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.position));

  return (
    variants.find((variant) => variant.id === defaultVariantId) ??
    variants.find((variant) => variant.isDefault) ??
    variants[0] ??
    null
  );
};

const getProductCategoryName = async (productId: string) => {
  const [row] = await db
    .select({ name: categories.name })
    .from(productCategories)
    .innerJoin(categories, eq(productCategories.categoryId, categories.id))
    .where(eq(productCategories.productId, productId))
    .limit(1);

  return row?.name ?? "General";
};

const serializeProductRow = async (
  product: typeof products.$inferSelect,
): Promise<SerializedProduct | null> => {
  const variant = await getDefaultVariant(product.id, product.defaultVariantId);

  if (!variant) {
    return null;
  }

  const category = await getProductCategoryName(product.id);
  const stock = await getVariantStock(variant.id);
  const metadata = isRecord(product.metadata) ? product.metadata : {};
  const imageTone =
    asString(metadata.imageTone) || imageToneForCategory(category);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    shortDescription: product.shortDescription,
    status: product.status,
    category,
    sku: variant.sku,
    variantId: variant.id,
    price: centsToDollars(variant.priceCents),
    priceCents: variant.priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    stock,
    currency: variant.currency,
    imageTone,
    createdAt: toIso(product.createdAt),
    updatedAt: toIso(product.updatedAt),
  };
};

const listSerializedProducts = async () => {
  if (SHOULD_SEED_DEMO) {
    await seedDemoData();
  }

  const rows = await db
    .select()
    .from(products)
    .where(isNull(products.deletedAt))
    .orderBy(asc(products.name));
  const serialized = await Promise.all(rows.map(serializeProductRow));

  return serialized.filter((product): product is SerializedProduct => Boolean(product));
};

const getSerializedProduct = async (id: string) => {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .limit(1);

  return product ? serializeProductRow(product) : null;
};

const createProductRecord = async (input: ProductInput) => {
  const category = await getOrCreateCategory(input.category);
  const slug = `${slugify(input.name)}-${Date.now().toString(36)}`;
  const sku =
    input.sku ??
    `${slugify(input.category).slice(0, 3).toUpperCase()}-${Date.now()
      .toString(36)
      .toUpperCase()}`;

  const [product] = await db
    .insert(products)
    .values({
      slug,
      name: input.name,
      description: input.description,
      shortDescription: input.description.slice(0, 160),
      status: input.status ?? "active",
      metadata: { imageTone: imageToneForCategory(input.category) },
    })
    .returning();

  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product.id,
      sku,
      name: "Default",
      priceCents: input.priceCents ?? dollarsToCents(input.price ?? 0),
      currency: DEFAULT_CURRENCY,
      position: 0,
      isDefault: true,
    })
    .returning();

  await db
    .update(products)
    .set({ defaultVariantId: variant.id, updatedAt: new Date() })
    .where(eq(products.id, product.id));
  await db.insert(productCategories).values({
    productId: product.id,
    categoryId: category.id,
  });
  await setVariantStock(variant.id, input.stock);

  const serialized = await getSerializedProduct(product.id);

  if (!serialized) {
    throw new Error("Created product could not be loaded");
  }

  return serialized;
};

const updateProductRecord = async (id: string, input: ProductInput) => {
  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .limit(1);

  if (!existing) {
    return null;
  }

  const category = await getOrCreateCategory(input.category);
  let variant = await getDefaultVariant(existing.id, existing.defaultVariantId);

  await db
    .update(products)
    .set({
      name: input.name,
      description: input.description,
      shortDescription: input.description.slice(0, 160),
      status: input.status ?? existing.status,
      metadata: { imageTone: imageToneForCategory(input.category) },
      updatedAt: new Date(),
    })
    .where(eq(products.id, id));

  if (!variant) {
    const [createdVariant] = await db
      .insert(productVariants)
      .values({
        productId: existing.id,
        sku: input.sku ?? `SKU-${Date.now().toString(36).toUpperCase()}`,
        name: "Default",
        priceCents: input.priceCents ?? dollarsToCents(input.price ?? 0),
        currency: DEFAULT_CURRENCY,
        position: 0,
        isDefault: true,
      })
      .returning();
    variant = createdVariant;
    await db
      .update(products)
      .set({ defaultVariantId: variant.id, updatedAt: new Date() })
      .where(eq(products.id, id));
  } else {
    await db
      .update(productVariants)
      .set({
        sku: input.sku ?? variant.sku,
        priceCents: input.priceCents ?? dollarsToCents(input.price ?? 0),
        updatedAt: new Date(),
      })
      .where(eq(productVariants.id, variant.id));
  }

  await db.delete(productCategories).where(eq(productCategories.productId, id));
  await db.insert(productCategories).values({
    productId: id,
    categoryId: category.id,
  });
  await setVariantStock(variant.id, input.stock);

  return getSerializedProduct(id);
};

const resolveVariant = async (productOrVariantId: string) => {
  const [variantById] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, productOrVariantId))
    .limit(1);

  if (variantById) {
    return variantById;
  }

  return getDefaultVariant(productOrVariantId);
};

const getActiveCart = async (sessionToken = DEFAULT_SESSION_TOKEN) => {
  const [existing] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.sessionToken, sessionToken), eq(carts.status, "active")))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(carts)
    .values({
      sessionToken,
      currency: DEFAULT_CURRENCY,
      status: "active",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    })
    .returning();

  return created;
};

const serializeCart = async (cartId?: string): Promise<SerializedCart> => {
  const cart = cartId
    ? (await db.select().from(carts).where(eq(carts.id, cartId)).limit(1))[0]
    : await getActiveCart();

  if (!cart) {
    return serializeCart((await getActiveCart()).id);
  }

  const items = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));
  const lines: CartLine[] = [];

  for (const item of items) {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, item.variantId))
      .limit(1);

    if (!variant) {
      continue;
    }

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, variant.productId))
      .limit(1);

    if (!product || product.deletedAt) {
      continue;
    }

    const serializedProduct = await serializeProductRow(product);

    if (!serializedProduct) {
      continue;
    }

    lines.push({
      product: {
        ...serializedProduct,
        sku: variant.sku,
        variantId: variant.id,
        price: centsToDollars(item.unitPriceCents),
        priceCents: item.unitPriceCents,
      },
      quantity: item.quantity,
      lineTotalCents: item.unitPriceCents * item.quantity,
    });
  }

  const subtotalCents = lines.reduce(
    (total, line) => total + line.lineTotalCents,
    0,
  );
  const shippingCents = subtotalCents > 0 && subtotalCents < 7500 ? 599 : 0;
  const taxCents = Math.round(subtotalCents * 0.0825);

  await db
    .update(carts)
    .set({ subtotalCents, updatedAt: new Date() })
    .where(eq(carts.id, cart.id));

  return {
    id: cart.id,
    items: lines.map((line) => ({
      productId: line.product.id,
      variantId: line.product.variantId,
      quantity: line.quantity,
    })),
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents + taxCents + shippingCents,
    createdAt: toIso(cart.createdAt),
    updatedAt: new Date().toISOString(),
  };
};

const setCartQuantity = async (
  productOrVariantId: string,
  quantity: number,
  mode: "add" | "set",
) => {
  const cart = await getActiveCart();
  const variant = await resolveVariant(productOrVariantId);

  if (!variant) {
    return { error: "Product not found", status: 404 } as const;
  }

  const stock = await getVariantStock(variant.id);
  const [existing] = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variant.id)))
    .limit(1);
  const nextQuantity =
    mode === "add" ? (existing?.quantity ?? 0) + quantity : quantity;

  if (nextQuantity < 0) {
    return { error: "quantity must be non-negative", status: 400 } as const;
  }

  if (nextQuantity > stock) {
    return { error: "Requested quantity exceeds available stock", status: 400 } as const;
  }

  if (nextQuantity === 0) {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variant.id)));
    return serializeCart(cart.id);
  }

  if (existing) {
    await db
      .update(cartItems)
      .set({ quantity: nextQuantity, unitPriceCents: variant.priceCents })
      .where(eq(cartItems.id, existing.id));
  } else {
    await db.insert(cartItems).values({
      cartId: cart.id,
      variantId: variant.id,
      quantity: nextQuantity,
      unitPriceCents: variant.priceCents,
    });
  }

  return serializeCart(cart.id);
};

const upsertCustomer = async (input: CustomerPayload) => {
  const { firstName, lastName } = splitName(input.name);
  const [existing] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, input.email))
    .limit(1);

  const customer = existing
    ? (
        await db
          .update(customers)
          .set({
            firstName,
            lastName,
            phone: input.phone,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(customers)
          .values({
            email: input.email,
            phone: input.phone,
            firstName,
            lastName,
            acceptsMarketing: false,
          })
          .returning()
      )[0];

  const [address] = await db
    .insert(addresses)
    .values({
      customerId: customer.id,
      label: "Shipping",
      firstName,
      lastName,
      line1: input.address.line1,
      line2: input.address.line2,
      city: input.address.city,
      region: input.address.state,
      postalCode: input.address.postalCode,
      country: input.address.country,
      phone: input.phone,
      isDefaultBilling: true,
      isDefaultShipping: true,
    })
    .returning();

  await db
    .update(customers)
    .set({
      defaultBillingAddressId: address.id,
      defaultShippingAddressId: address.id,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customer.id));

  return { ...customer, defaultBillingAddressId: address.id, defaultShippingAddressId: address.id };
};

const serializeCustomer = async (customer: typeof customers.$inferSelect) => {
  const [address] = await db
    .select()
    .from(addresses)
    .where(eq(addresses.customerId, customer.id))
    .orderBy(asc(addresses.id))
    .limit(1);

  return {
    id: customer.id,
    name: `${customer.firstName} ${customer.lastName}`.trim(),
    email: customer.email,
    phone: customer.phone ?? undefined,
    address: {
      line1: address?.line1 ?? "",
      line2: address?.line2 ?? undefined,
      city: address?.city ?? "",
      state: address?.region ?? "",
      postalCode: address?.postalCode ?? "",
      country: address?.country ?? "US",
    },
    createdAt: toIso(customer.createdAt),
  };
};

const serializeOrder = async (order: typeof orders.$inferSelect) => {
  const lines = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const customer = order.customerId
    ? (await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1))[0]
    : null;

  return {
    id: order.id,
    orderNumber: order.number,
    customer: {
      name: customer
        ? `${customer.firstName} ${customer.lastName}`.trim()
        : order.email,
      email: order.email,
    },
    lines: lines.map((line) => ({
      productId: line.variantId ?? "",
      variantId: line.variantId,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.totalCents,
    })),
    subtotalCents: order.subtotalCents,
    taxCents: order.taxTotalCents,
    shippingCents: order.shippingTotalCents,
    totalCents: order.totalCents,
    status: order.status,
    createdAt: toIso(order.placedAt ?? order.createdAt),
  };
};

let seedPromise: Promise<void> | null = null;

const seedDemoData = async () => {
  if (seedPromise) {
    return seedPromise;
  }

  seedPromise = (async () => {
    const [existing] = await db.select().from(products).limit(1);

    if (existing) {
      return;
    }

    await createProductRecord({
      name: "Aurora Hoodie",
      description: "Midweight fleece hoodie with a clean embroidered mark.",
      priceCents: 6400,
      stock: 42,
      category: "Apparel",
      sku: "APP-HOODIE-001",
      status: "active",
    });
    await createProductRecord({
      name: "Nimbus Sneakers",
      description: "Light everyday sneakers made for long city walks.",
      priceCents: 12000,
      stock: 18,
      category: "Footwear",
      sku: "FTW-NIMBUS-101",
      status: "active",
    });
    await createProductRecord({
      name: "Echo Wireless Buds",
      description: "Compact earbuds with noise control and a 24 hour case.",
      priceCents: 14999,
      stock: 9,
      category: "Electronics",
      sku: "ELC-ECHO-024",
      status: "active",
    });
    await createProductRecord({
      name: "Loom Tote Bag",
      description: "Heavy canvas tote with reinforced handles.",
      priceCents: 2850,
      stock: 120,
      category: "Accessories",
      sku: "ACC-LOOM-012",
      status: "active",
    });

    await upsertCustomer({
      name: "Maya Chen",
      email: "maya@example.com",
      phone: "555-0134",
      address: {
        line1: "402 Market Street",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
      },
    });
  })();

  return seedPromise;
};

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    name: "api",
    message: "Scalable Commerce API is running",
    persistence: "drizzle-postgres",
  });
});

app.get("/requirements", (_req, res) => {
  res.json([
    "Catalog with products, variants, categories, pricing, and inventory",
    "Cart with variant line items and unit price snapshots",
    "Checkout with customer, address, stock validation, and order snapshots",
    "Orders with status, totals, and denormalized line item data",
    "Customers with contact and shipping address records",
    "Summary metrics for storefront and admin dashboards",
  ]);
});

app.get(
  "/summary",
  asyncRoute(async (_req, res) => {
    const productList = await listSerializedProducts();
    const orderList = await db.select().from(orders);
    const customerList = await db.select().from(customers);
    const cartList = await db
      .select()
      .from(carts)
      .where(eq(carts.status, "active"));
    const openCartCount = (
      await Promise.all(
        cartList.map(async (cart) => {
          const lines = await db
            .select()
            .from(cartItems)
            .where(eq(cartItems.cartId, cart.id));
          return lines.length > 0;
        }),
      )
    ).filter(Boolean).length;

    res.json({
      productCount: productList.length,
      activeProductCount: productList.filter((product) => product.status === "active")
        .length,
      lowStockCount: productList.filter((product) => product.stock <= 10).length,
      openCartCount,
      orderCount: orderList.length,
      customerCount: customerList.length,
      totalRevenueCents: orderList
        .filter((order) => order.status !== "cancelled")
        .reduce((total, order) => total + order.totalCents, 0),
    });
  }),
);

app.get(
  "/categories",
  asyncRoute(async (_req, res) => {
    if (SHOULD_SEED_DEMO) {
      await seedDemoData();
    }

    const categoryRows = await db.select().from(categories).orderBy(asc(categories.name));
    const result = await Promise.all(
      categoryRows.map(async (category) => {
        const productsInCategory = await db
          .select()
          .from(productCategories)
          .where(eq(productCategories.categoryId, category.id));

        return {
          id: category.id,
          slug: category.slug,
          name: category.name,
          productCount: productsInCategory.length,
        };
      }),
    );

    res.json(result);
  }),
);

app.get(
  "/products",
  asyncRoute(async (req, res) => {
    const search = asString(req.query.search).toLowerCase();
    const category = asString(req.query.category);
    const status = asString(req.query.status);
    const inStock = asString(req.query.inStock);
    const productList = await listSerializedProducts();

    res.json(
      productList.filter((product) => {
        const matchesSearch =
          !search ||
          product.name.toLowerCase().includes(search) ||
          product.sku.toLowerCase().includes(search) ||
          product.description.toLowerCase().includes(search);
        const matchesCategory = !category || product.category === category;
        const matchesStatus = status
          ? product.status === status
          : product.status !== "archived";
        const matchesStock = inStock !== "true" || product.stock > 0;

        return matchesSearch && matchesCategory && matchesStatus && matchesStock;
      }),
    );
  }),
);

app.post(
  "/products",
  asyncRoute(async (req, res) => {
    const input = parseProductInput(req.body);

    if ("error" in input) {
      sendError(res, 400, input.error);
      return;
    }

    res.status(201).json(await createProductRecord(input));
  }),
);

app.get(
  "/products/:id",
  asyncRoute(async (req, res) => {
    const product = await getSerializedProduct(routeParam(req, "id"));

    if (!product) {
      sendError(res, 404, "Product not found");
      return;
    }

    res.json(product);
  }),
);

const updateProductHandler = asyncRoute(async (req, res) => {
  const input = parseProductInput(req.body);

  if ("error" in input) {
    sendError(res, 400, input.error);
    return;
  }

  const product = await updateProductRecord(routeParam(req, "id"), input);

  if (!product) {
    sendError(res, 404, "Product not found");
    return;
  }

  res.json(product);
});

app.put("/products/:id", updateProductHandler);
app.patch("/products/:id", updateProductHandler);

app.delete(
  "/products/:id",
  asyncRoute(async (req, res) => {
    const productId = routeParam(req, "id");
    const [product] = await db
      .update(products)
      .set({ status: "archived", deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(products.id, productId), isNull(products.deletedAt)))
      .returning();

    if (!product) {
      sendError(res, 404, "Product not found");
      return;
    }

    res.status(204).end();
  }),
);

app.get(
  "/cart",
  asyncRoute(async (_req, res) => {
    res.json(await serializeCart());
  }),
);

app.delete(
  "/cart",
  asyncRoute(async (_req, res) => {
    const cart = await getActiveCart();
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    res.json(await serializeCart(cart.id));
  }),
);

app.post(
  "/cart/items",
  asyncRoute(async (req, res) => {
    if (!isRecord(req.body)) {
      sendError(res, 400, "Expected a JSON object");
      return;
    }

    const productId = asString(req.body.productId || req.body.variantId);
    const quantity = asInteger(req.body.quantity ?? 1);

    if (!productId || quantity === null || quantity <= 0) {
      sendError(res, 400, "productId and a positive quantity are required");
      return;
    }

    const result = await setCartQuantity(productId, quantity, "add");

    if ("error" in result) {
      sendError(res, result.status, result.error);
      return;
    }

    res.status(201).json(result);
  }),
);

app.patch(
  "/cart/items/:productId",
  asyncRoute(async (req, res) => {
    if (!isRecord(req.body)) {
      sendError(res, 400, "Expected a JSON object");
      return;
    }

    const quantity = asInteger(req.body.quantity);

    if (quantity === null || quantity < 0) {
      sendError(res, 400, "quantity must be a non-negative integer");
      return;
    }

    const result = await setCartQuantity(routeParam(req, "productId"), quantity, "set");

    if ("error" in result) {
      sendError(res, result.status, result.error);
      return;
    }

    res.json(result);
  }),
);

app.delete(
  "/cart/items/:productId",
  asyncRoute(async (req, res) => {
    const result = await setCartQuantity(routeParam(req, "productId"), 0, "set");

    if ("error" in result) {
      sendError(res, result.status, result.error);
      return;
    }

    res.json(result);
  }),
);

app.get(
  "/carts/:cartId",
  asyncRoute(async (req, res) => {
    res.json(await serializeCart(routeParam(req, "cartId")));
  }),
);

app.delete(
  "/carts/:cartId",
  asyncRoute(async (req, res) => {
    const cartId = routeParam(req, "cartId");
    await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
    res.json(await serializeCart(cartId));
  }),
);

app.post(
  "/checkout",
  asyncRoute(async (req, res) => {
    const body = isRecord(req.body) ? req.body : {};
    const customerInput = parseCustomerPayload(body.customer);

    if (!customerInput) {
      sendError(res, 400, "A complete customer object is required");
      return;
    }

    const cart = await getActiveCart();
    const serializedCart = await serializeCart(cart.id);

    if (serializedCart.itemCount === 0) {
      sendError(res, 400, "Cart is empty");
      return;
    }

    for (const line of serializedCart.lines) {
      const stock = await getVariantStock(line.product.variantId);

      if (line.quantity > stock) {
        sendError(res, 400, `${line.product.name} does not have enough stock`);
        return;
      }
    }

    const customer = await upsertCustomer(customerInput);
    const orderNumber = `SC-${Date.now().toString(36).toUpperCase()}`;
    const placedAt = new Date();
    const [order] = await db
      .insert(orders)
      .values({
        number: orderNumber,
        customerId: customer.id,
        email: customer.email,
        status: "paid",
        paymentStatus: "paid",
        fulfillmentStatus: "unfulfilled",
        currency: DEFAULT_CURRENCY,
        subtotalCents: serializedCart.subtotalCents,
        discountTotalCents: 0,
        taxTotalCents: serializedCart.taxCents,
        shippingTotalCents: serializedCart.shippingCents,
        totalCents: serializedCart.totalCents,
        billingAddress: customerInput.address,
        shippingAddress: customerInput.address,
        placedAt,
      })
      .returning();

    for (const line of serializedCart.lines) {
      await db.insert(orderItems).values({
        orderId: order.id,
        variantId: line.product.variantId,
        sku: line.product.sku,
        name: line.product.name,
        quantity: line.quantity,
        unitPriceCents: line.product.priceCents,
        totalCents: line.lineTotalCents,
        taxCents: Math.round(line.lineTotalCents * 0.0825),
        discountCents: 0,
      });

      const location = await getDefaultLocation();
      const [stockRow] = await db
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.variantId, line.product.variantId),
            eq(inventoryItems.locationId, location.id),
          ),
        )
        .limit(1);

      if (stockRow) {
        await db
          .update(inventoryItems)
          .set({
            onHand: Math.max(0, stockRow.onHand - line.quantity),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryItems.variantId, line.product.variantId),
              eq(inventoryItems.locationId, location.id),
            ),
          );
      }

      await db.insert(inventoryMovements).values({
        variantId: line.product.variantId,
        locationId: location.id,
        delta: -line.quantity,
        reason: "sale",
        referenceType: "order",
        referenceId: order.id,
        note: `Order ${order.number}`,
      });
    }

    await db.insert(orderEvents).values({
      orderId: order.id,
      type: "created",
      payload: { source: "checkout" },
    });
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db
      .update(carts)
      .set({ status: "converted", updatedAt: new Date() })
      .where(eq(carts.id, cart.id));

    res.status(201).json(await serializeOrder(order));
  }),
);

app.get(
  "/orders",
  asyncRoute(async (_req, res) => {
    const rows = await db.select().from(orders).orderBy(asc(orders.createdAt));
    const result = await Promise.all(rows.reverse().map(serializeOrder));
    res.json(result);
  }),
);

app.get(
  "/orders/:id",
  asyncRoute(async (req, res) => {
    const orderId = routeParam(req, "id");
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      sendError(res, 404, "Order not found");
      return;
    }

    res.json(await serializeOrder(order));
  }),
);

app.patch(
  "/orders/:id",
  asyncRoute(async (req, res) => {
    const orderId = routeParam(req, "id");
    if (!isRecord(req.body)) {
      sendError(res, 400, "Expected a JSON object");
      return;
    }

    const status = asString(req.body.status);

    if (
      status !== "pending" &&
      status !== "paid" &&
      status !== "fulfilled" &&
      status !== "shipped" &&
      status !== "delivered" &&
      status !== "cancelled" &&
      status !== "refunded"
    ) {
      sendError(res, 400, "Invalid order status");
      return;
    }

    const [order] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();

    if (!order) {
      sendError(res, 404, "Order not found");
      return;
    }

    res.json(await serializeOrder(order));
  }),
);

app.get(
  "/customers",
  asyncRoute(async (_req, res) => {
    if (SHOULD_SEED_DEMO) {
      await seedDemoData();
    }

    const rows = await db.select().from(customers).orderBy(asc(customers.createdAt));
    const result = await Promise.all(rows.reverse().map(serializeCustomer));
    res.json(result);
  }),
);

app.post(
  "/customers",
  asyncRoute(async (req, res) => {
    const customerInput = parseCustomerPayload(req.body);

    if (!customerInput) {
      sendError(res, 400, "name, email, and complete address are required");
      return;
    }

    const customer = await upsertCustomer(customerInput);
    const [fresh] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customer.id))
      .limit(1);

    res.status(201).json(await serializeCustomer(fresh));
  }),
);

app.get(
  "/customers/:id",
  asyncRoute(async (req, res) => {
    const customerId = routeParam(req, "id");
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      sendError(res, 404, "Customer not found");
      return;
    }

    res.json(await serializeCustomer(customer));
  }),
);

const prepareDatabase = async () => {
  if (!SHOULD_AUTO_MIGRATE) {
    return;
  }

  await pool.query("CREATE EXTENSION IF NOT EXISTS citext");
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log("Database migrations applied");
};

const start = async () => {
  await prepareDatabase();

  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
};

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

const shutdown = async () => {
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
