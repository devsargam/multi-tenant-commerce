export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-12 py-16 text-center">
        <div className="text-lg font-semibold tracking-tight">{title}</div>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          This section is a placeholder. Wire it up to the API when the
          corresponding endpoints exist.
        </p>
      </div>
    </div>
  );
}
