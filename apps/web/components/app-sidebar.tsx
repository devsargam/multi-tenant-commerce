"use client"

import type * as React from "react"
import {
  ChartLineUpIcon,
  GearSixIcon,
  PackageIcon,
  ReceiptIcon,
  ShoppingCartIcon,
  StorefrontIcon,
  UsersIcon,
} from "@phosphor-icons/react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"

export type CommerceSection =
  | "overview"
  | "catalog"
  | "cart"
  | "checkout"
  | "orders"
  | "customers"
  | "settings"

type NavItem = {
  id: CommerceSection
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
}

const primaryNav: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    hint: "Metrics and requirements",
    icon: ChartLineUpIcon,
  },
  {
    id: "catalog",
    label: "Catalog",
    hint: "Browse and add products",
    icon: StorefrontIcon,
  },
  {
    id: "cart",
    label: "Cart",
    hint: "Edit quantities",
    icon: ShoppingCartIcon,
  },
  {
    id: "checkout",
    label: "Checkout",
    hint: "Customer and shipping",
    icon: PackageIcon,
  },
]

const secondaryNav: NavItem[] = [
  {
    id: "orders",
    label: "Orders",
    hint: "Recent purchases",
    icon: ReceiptIcon,
  },
  {
    id: "customers",
    label: "Customers",
    hint: "Buyer records",
    icon: UsersIcon,
  },
  {
    id: "settings",
    label: "Settings",
    hint: "Simple store rules",
    icon: GearSixIcon,
  },
]

type AppSidebarProps = {
  activeSection: CommerceSection
  cartCount: number
  onSectionChange: (section: CommerceSection) => void
}

function AppSidebar({
  activeSection,
  cartCount,
  onSectionChange,
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground">
            <StorefrontIcon className="size-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-semibold">Scalable Commerce</p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              Minimal storefront
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Storefront</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeSection === item.id}
                      onClick={() => onSectionChange(item.id)}
                      tooltip={item.label}
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.id === "cart" && cartCount > 0 ? (
                      <SidebarMenuBadge>{cartCount}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeSection === item.id}
                      onClick={() => onSectionChange(item.id)}
                      tooltip={item.label}
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="group-data-[collapsible=icon]:hidden">
          <p className="text-xs font-medium">Demo mode</p>
          <p className="text-xs text-sidebar-foreground/60">
            In-memory data, no database.
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export { AppSidebar }
