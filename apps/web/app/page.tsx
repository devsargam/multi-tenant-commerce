"use client"

import * as React from "react"
import {
  ArrowRightIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import { AppSidebar, type CommerceSection } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

type Product = {
  id: string
  sku: string
  name: string
  description: string
  priceCents: number
  compareAtPriceCents?: number
  stock: number
  category: string
  imageTone: string
  status: "active" | "draft" | "archived"
}

type CartLine = {
  product: Product
  quantity: number
  lineTotalCents: number
}

type Cart = {
  id: string
  lines: CartLine[]
  itemCount: number
  subtotalCents: number
  taxCents: number
  shippingCents: number
  totalCents: number
}

type Customer = {
  id: string
  name: string
  email: string
  phone?: string
  address: Address
  createdAt: string
}

type Address = {
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

type Order = {
  id: string
  orderNumber: string
  customer: {
    name: string
    email: string
  }
  lines: Array<{
    productId: string
    sku: string
    name: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
  }>
  subtotalCents: number
  taxCents: number
  shippingCents: number
  totalCents: number
  status:
    | "pending"
    | "paid"
    | "fulfilled"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "refunded"
  createdAt: string
}

type Summary = {
  productCount: number
  activeProductCount: number
  lowStockCount: number
  openCartCount: number
  orderCount: number
  customerCount: number
  totalRevenueCents: number
}

type CheckoutForm = {
  name: string
  email: string
  phone: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const commerceRequirements = [
  "Catalog: SKU, product name, description, category, price, status, and available stock.",
  "Discovery: search, category filtering, low-stock signals, and clear add-to-cart actions.",
  "Cart: quantity updates, item removal, subtotal, tax, shipping, and total calculation.",
  "Checkout: customer identity, shipping address, stock validation, and order creation.",
  "Orders: order number, line items, payment state, fulfillment state, and customer contact.",
  "Operations: customers, inventory warnings, revenue summary, and simple store settings.",
]

const initialCheckoutForm: CheckoutForm = {
  name: "Maya Chen",
  email: "maya@example.com",
  phone: "555-0134",
  line1: "402 Market Street",
  line2: "",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "US",
}

function formatMoney(cents: number) {
  return money.format(cents / 100)
}

function buildCart(lines: CartLine[]): Cart {
  const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0)
  const shippingCents = subtotalCents > 0 && subtotalCents < 7500 ? 599 : 0
  const taxCents = Math.round(subtotalCents * 0.0825)

  return {
    id: "pending-api-cart",
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents + taxCents + shippingCents,
  }
}

function emptyCart(): Cart {
  return buildCart([])
}

function buildSummary(
  products: Product[],
  orders: Order[],
  customers: Customer[],
  cart: Cart,
): Summary {
  return {
    productCount: products.length,
    activeProductCount: products.filter((product) => product.status === "active").length,
    lowStockCount: products.filter((product) => product.stock <= 10).length,
    openCartCount: cart.itemCount > 0 ? 1 : 0,
    orderCount: orders.length,
    customerCount: customers.length,
    totalRevenueCents: orders
      .filter((order) => order.status !== "cancelled")
      .reduce((total, order) => total + order.totalCents, 0),
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json() as Promise<T>
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "API request failed"
}

export default function Home() {
  const [activeSection, setActiveSection] =
    React.useState<CommerceSection>("overview")
  const [products, setProducts] = React.useState<Product[]>([])
  const [cart, setCart] = React.useState<Cart>(() => emptyCart())
  const [orders, setOrders] = React.useState<Order[]>([])
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [search, setSearch] = React.useState("")
  const [category, setCategory] = React.useState("All")
  const [isApiConnected, setIsApiConnected] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isCheckingOut, setIsCheckingOut] = React.useState(false)
  const [notice, setNotice] = React.useState("Ready")
  const [checkoutForm, setCheckoutForm] =
    React.useState<CheckoutForm>(initialCheckoutForm)

  const loadCommerce = React.useCallback(async () => {
    setIsLoading(true)

    try {
      const [productData, cartData, orderData, customerData, summaryData] =
        await Promise.all([
          apiRequest<Product[]>("/products"),
          apiRequest<Cart>("/cart"),
          apiRequest<Order[]>("/orders"),
          apiRequest<Customer[]>("/customers"),
          apiRequest<Summary>("/summary"),
        ])

      setProducts(productData)
      setCart(cartData)
      setOrders(orderData)
      setCustomers(customerData)
      setSummary(summaryData)
      setIsApiConnected(true)
      setNotice("Connected to the API")
    } catch (error) {
      setProducts([])
      setCart(emptyCart())
      setOrders([])
      setCustomers([])
      setSummary(null)
      setIsApiConnected(false)
      setNotice(`API unavailable: ${getErrorMessage(error)}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadCommerce()
  }, [loadCommerce])

  const categories = React.useMemo(
    () => ["All", ...Array.from(new Set(products.map((product) => product.category)))],
    [products],
  )

  const filteredProducts = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.sku.toLowerCase().includes(normalizedSearch) ||
        product.description.toLowerCase().includes(normalizedSearch)

      return matchesCategory && matchesSearch && product.status === "active"
    })
  }, [category, products, search])

  const metrics = summary ?? buildSummary(products, orders, customers, cart)

  const addToCart = async (product: Product) => {
    setActiveSection("cart")

    try {
      const updatedCart = await apiRequest<Cart>("/cart/items", {
        method: "POST",
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      })

      setCart(updatedCart)
      setIsApiConnected(true)
      setNotice(`${product.name} added to cart`)
    } catch (error) {
      setIsApiConnected(false)
      setNotice(`Add to cart failed: ${getErrorMessage(error)}`)
    }
  }

  const setCartQuantity = async (product: Product, quantity: number) => {
    try {
      const updatedCart =
        quantity <= 0
          ? await apiRequest<Cart>(`/cart/items/${product.id}`, {
              method: "DELETE",
            })
          : await apiRequest<Cart>(`/cart/items/${product.id}`, {
              method: "PATCH",
              body: JSON.stringify({ quantity }),
            })

      setCart(updatedCart)
      setIsApiConnected(true)
      setNotice("Cart updated")
    } catch (error) {
      setIsApiConnected(false)
      setNotice(`Cart update failed: ${getErrorMessage(error)}`)
    }
  }

  const clearCart = async () => {
    try {
      const updatedCart = await apiRequest<Cart>("/cart", {
        method: "DELETE",
      })

      setCart(updatedCart)
      setIsApiConnected(true)
      setNotice("Cart cleared")
    } catch (error) {
      setIsApiConnected(false)
      setNotice(`Cart clear failed: ${getErrorMessage(error)}`)
    }
  }

  const updateCheckoutField = (field: keyof CheckoutForm, value: string) => {
    setCheckoutForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const placeOrder = async () => {
    if (cart.itemCount === 0 || isCheckingOut) {
      return
    }

    setIsCheckingOut(true)

    try {
      const order = await apiRequest<Order>("/checkout", {
        method: "POST",
        body: JSON.stringify({
          customer: {
            name: checkoutForm.name,
            email: checkoutForm.email,
            phone: checkoutForm.phone,
            address: {
              line1: checkoutForm.line1,
              line2: checkoutForm.line2,
              city: checkoutForm.city,
              state: checkoutForm.state,
              postalCode: checkoutForm.postalCode,
              country: checkoutForm.country,
            },
          },
        }),
      })

      setOrders((current) => [order, ...current])
      const [updatedProducts, updatedCart, updatedCustomers, updatedSummary] =
        await Promise.all([
          apiRequest<Product[]>("/products"),
          apiRequest<Cart>("/cart"),
          apiRequest<Customer[]>("/customers"),
          apiRequest<Summary>("/summary"),
        ])

      setProducts(updatedProducts)
      setCart(updatedCart)
      setCustomers(updatedCustomers)
      setSummary(updatedSummary)
      setIsApiConnected(true)
      setActiveSection("orders")
      setNotice(`Order ${order.orderNumber} placed`)
    } catch (error) {
      setIsApiConnected(false)
      setNotice(`Checkout failed: ${getErrorMessage(error)}`)
    } finally {
      setIsCheckingOut(false)
    }
  }

  const statCards = [
    ["Products", metrics.productCount.toString()],
    ["Active", metrics.activeProductCount.toString()],
    ["Low stock", metrics.lowStockCount.toString()],
    ["Revenue", formatMoney(metrics.totalRevenueCents)],
    ["Orders", metrics.orderCount.toString()],
    ["Customers", metrics.customerCount.toString()],
  ]

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          activeSection={activeSection}
          cartCount={cart.itemCount}
          onSectionChange={setActiveSection}
        />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {sectionTitles[activeSection]}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {notice}
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              {isApiConnected ? (
                <CheckCircleIcon className="size-4 text-emerald-600" />
              ) : (
                <WarningCircleIcon className="size-4 text-amber-600" />
              )}
              {isApiConnected ? "API connected" : "API unavailable"}
            </div>
          </header>

          <main className="min-h-screen bg-background p-4 md:p-6">
            {isLoading ? (
              <div className="flex min-h-[60vh] items-center justify-center border bg-card text-sm text-muted-foreground">
                Loading commerce workspace
              </div>
            ) : null}

            {!isLoading && activeSection === "overview" ? (
              <section className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {statCards.map(([label, value]) => (
                    <div key={label} className="border bg-card p-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-2 text-2xl font-semibold">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="border bg-card p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h1 className="text-xl font-semibold">
                          Basic commerce requirements
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          The smallest useful store still needs these flows.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setActiveSection("catalog")}
                      >
                        Open catalog
                        <ArrowRightIcon />
                      </Button>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {commerceRequirements.map((requirement) => (
                        <div key={requirement} className="border bg-background p-4">
                          <CheckCircleIcon className="mb-3 size-5 text-emerald-600" />
                          <p className="text-sm leading-6">{requirement}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border bg-card p-5">
                    <h2 className="text-base font-semibold">Current cart</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {cart.itemCount} items ready for checkout.
                    </p>
                    <div className="mt-5 space-y-3">
                      {cart.lines.length === 0 ? (
                        <p className="border bg-background p-4 text-sm text-muted-foreground">
                          Add products from the catalog to start an order.
                        </p>
                      ) : (
                        cart.lines.map((line) => (
                          <div
                            key={line.product.id}
                            className="flex items-center justify-between gap-4 border-b pb-3 last:border-b-0"
                          >
                            <div>
                              <p className="text-sm font-medium">{line.product.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {line.quantity} x {formatMoney(line.product.priceCents)}
                              </p>
                            </div>
                            <p className="text-sm font-semibold">
                              {formatMoney(line.lineTotalCents)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                    <Button
                      type="button"
                      className="mt-5 w-full"
                      disabled={cart.itemCount === 0}
                      onClick={() => setActiveSection("checkout")}
                    >
                      Go to checkout
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {!isLoading && activeSection === "catalog" ? (
              <section className="space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h1 className="text-xl font-semibold">Catalog</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Search products, filter categories, and build a cart.
                    </p>
                  </div>
                  <div className="relative w-full md:max-w-sm">
                    <MagnifyingGlassIcon className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search products or SKUs"
                      className="pl-8"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {categories.map((item) => (
                    <Button
                      key={item}
                      type="button"
                      variant={category === item ? "default" : "outline"}
                      onClick={() => setCategory(item)}
                    >
                      {item}
                    </Button>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {filteredProducts.map((product) => (
                    <article key={product.id} className="flex flex-col border bg-card">
                      <div
                        className={`m-3 flex aspect-[4/3] items-center justify-center border text-3xl font-semibold ${product.imageTone}`}
                      >
                        {product.name
                          .split(" ")
                          .map((word) => word[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="flex flex-1 flex-col p-4 pt-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="text-sm font-semibold">{product.name}</h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {product.sku}
                            </p>
                          </div>
                          <p className="text-sm font-semibold">
                            {formatMoney(product.priceCents)}
                          </p>
                        </div>
                        <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                          {product.description}
                        </p>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground">
                            {product.stock} in stock
                          </span>
                          <Button
                            type="button"
                            disabled={product.stock === 0}
                            onClick={() => void addToCart(product)}
                          >
                            <PlusIcon />
                            Add
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {!isLoading && activeSection === "cart" ? (
              <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
                <div className="border bg-card p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-semibold">Cart</h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Adjust quantities before checkout.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={cart.itemCount === 0}
                      onClick={() => void clearCart()}
                    >
                      <TrashIcon />
                      Clear
                    </Button>
                  </div>

                  <div className="mt-5 divide-y border">
                    {cart.lines.length === 0 ? (
                      <div className="p-6 text-sm text-muted-foreground">
                        Your cart is empty.
                      </div>
                    ) : (
                      cart.lines.map((line) => (
                        <div
                          key={line.product.id}
                          className="grid gap-4 p-4 md:grid-cols-[1fr_auto_auto] md:items-center"
                        >
                          <div>
                            <p className="font-medium">{line.product.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {line.product.sku} · {formatMoney(line.product.priceCents)}
                            </p>
                          </div>
                          <div className="flex w-fit items-center border">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                void setCartQuantity(line.product, line.quantity - 1)
                              }
                            >
                              <MinusIcon />
                            </Button>
                            <span className="w-10 text-center text-sm">
                              {line.quantity}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={line.quantity >= line.product.stock}
                              onClick={() =>
                                void setCartQuantity(line.product, line.quantity + 1)
                              }
                            >
                              <PlusIcon />
                            </Button>
                          </div>
                          <p className="text-sm font-semibold md:text-right">
                            {formatMoney(line.lineTotalCents)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <OrderSummary cart={cart} onCheckout={() => setActiveSection("checkout")} />
              </section>
            ) : null}

            {!isLoading && activeSection === "checkout" ? (
              <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
                <div className="border bg-card p-5">
                  <h1 className="text-xl font-semibold">Checkout</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Capture the customer and shipping details for this order.
                  </p>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Name"
                      value={checkoutForm.name}
                      onChange={(value) => updateCheckoutField("name", value)}
                    />
                    <Field
                      label="Email"
                      value={checkoutForm.email}
                      onChange={(value) => updateCheckoutField("email", value)}
                    />
                    <Field
                      label="Phone"
                      value={checkoutForm.phone}
                      onChange={(value) => updateCheckoutField("phone", value)}
                    />
                    <Field
                      label="Address"
                      value={checkoutForm.line1}
                      onChange={(value) => updateCheckoutField("line1", value)}
                    />
                    <Field
                      label="Apt, suite"
                      value={checkoutForm.line2}
                      onChange={(value) => updateCheckoutField("line2", value)}
                    />
                    <Field
                      label="City"
                      value={checkoutForm.city}
                      onChange={(value) => updateCheckoutField("city", value)}
                    />
                    <Field
                      label="State"
                      value={checkoutForm.state}
                      onChange={(value) => updateCheckoutField("state", value)}
                    />
                    <Field
                      label="Postal code"
                      value={checkoutForm.postalCode}
                      onChange={(value) => updateCheckoutField("postalCode", value)}
                    />
                  </div>
                  <Button
                    type="button"
                    className="mt-5"
                    disabled={cart.itemCount === 0 || isCheckingOut}
                    onClick={() => void placeOrder()}
                  >
                    {isCheckingOut ? "Placing order" : "Place order"}
                  </Button>
                </div>
                <OrderSummary cart={cart} onCheckout={() => void placeOrder()} />
              </section>
            ) : null}

            {!isLoading && activeSection === "orders" ? (
              <section className="space-y-5">
                <div>
                  <h1 className="text-xl font-semibold">Orders</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Orders created from the API checkout flow.
                  </p>
                </div>
                <div className="divide-y border bg-card">
                  {orders.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                      No orders yet.
                    </p>
                  ) : (
                    orders.map((order) => (
                      <article
                        key={order.id}
                        className="grid gap-4 p-4 lg:grid-cols-[1fr_auto_auto]"
                      >
                        <div>
                          <p className="font-medium">{order.orderNumber}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {order.customer.name} · {order.customer.email}
                          </p>
                          <p className="mt-3 text-sm text-muted-foreground">
                            {order.lines
                              .map((line) => `${line.quantity} x ${line.name}`)
                              .join(", ")}
                          </p>
                        </div>
                        <span className="h-fit w-fit border px-2 py-1 text-xs capitalize">
                          {order.status}
                        </span>
                        <p className="text-sm font-semibold lg:text-right">
                          {formatMoney(order.totalCents)}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {!isLoading && activeSection === "customers" ? (
              <section className="space-y-5">
                <div>
                  <h1 className="text-xl font-semibold">Customers</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Lightweight customer records captured at checkout.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {customers.map((customer) => (
                    <article key={customer.id} className="border bg-card p-4">
                      <p className="font-medium">{customer.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {customer.email}
                      </p>
                      <p className="mt-4 text-xs leading-5 text-muted-foreground">
                        {customer.address.line1}
                        <br />
                        {customer.address.city}, {customer.address.state}{" "}
                        {customer.address.postalCode}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {!isLoading && activeSection === "settings" ? (
              <section className="space-y-5">
                <div>
                  <h1 className="text-xl font-semibold">Settings</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Minimal store rules used by the API checkout.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <SettingCard label="Currency" value="USD" />
                  <SettingCard label="Tax" value="8.25%" />
                  <SettingCard label="Shipping" value="$5.99 under $75" />
                </div>
              </section>
            ) : null}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

const sectionTitles: Record<CommerceSection, string> = {
  overview: "Overview",
  catalog: "Catalog",
  cart: "Cart",
  checkout: "Checkout",
  orders: "Orders",
  customers: "Customers",
  settings: "Settings",
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium">
      {label}
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function OrderSummary({
  cart,
  onCheckout,
}: {
  cart: Cart
  onCheckout: () => void
}) {
  const rows = [
    ["Subtotal", cart.subtotalCents],
    ["Tax", cart.taxCents],
    ["Shipping", cart.shippingCents],
  ] as const

  return (
    <aside className="h-fit border bg-card p-5">
      <h2 className="text-base font-semibold">Order summary</h2>
      <div className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span>{formatMoney(value)}</span>
          </div>
        ))}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between font-semibold">
            <span>Total</span>
            <span>{formatMoney(cart.totalCents)}</span>
          </div>
        </div>
      </div>
      <Button
        type="button"
        className="mt-5 w-full"
        disabled={cart.itemCount === 0}
        onClick={onCheckout}
      >
        Checkout
      </Button>
    </aside>
  )
}

function SettingCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}
