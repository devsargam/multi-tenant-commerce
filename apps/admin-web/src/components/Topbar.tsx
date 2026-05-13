export default function Topbar({ title }: { title: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          Docs
        </button>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-sm font-medium text-slate-700">
          SA
        </div>
      </div>
    </header>
  );
}
