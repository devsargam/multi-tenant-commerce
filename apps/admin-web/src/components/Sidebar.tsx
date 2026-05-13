import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: "▦" },
  { to: "/products", label: "Products", icon: "▤" },
  { to: "/orders", label: "Orders", icon: "▦" },
  { to: "/customers", label: "Customers", icon: "◉" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
          C
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Commerce</div>
          <div className="text-xs text-slate-500">Admin Console</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")
            }
          >
            <span className="text-base leading-none">{l.icon}</span>
            <span>{l.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
