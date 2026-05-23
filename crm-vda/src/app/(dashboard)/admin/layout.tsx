import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role?.name !== "admin") redirect("/");

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="mb-6 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/" className="hover:text-zinc-900">Inicio</Link>
        <span>/</span>
        <Link href="/admin" className="hover:text-zinc-900">Admin</Link>
      </nav>
      {children}
    </div>
  );
}
