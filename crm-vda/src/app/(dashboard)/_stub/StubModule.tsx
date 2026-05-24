export function StubModule({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-zinc-200 bg-white p-10 text-center">
        <div className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-400">
          En construcción
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}
