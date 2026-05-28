import { redirect } from "next/navigation";

export default async function AnalisisRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  redirect(qs ? `/supermercados?${qs}` : "/supermercados");
}
