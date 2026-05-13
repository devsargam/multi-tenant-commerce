import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/products": "Products",
  "/orders": "Orders",
  "/customers": "Customers",
};

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const title =
    titles[pathname] ??
    (pathname.startsWith("/products") ? "Products" : "Admin");

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
