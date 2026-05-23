import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getUserModules } from "@/lib/auth";
import { MODULE_ICONS, MODULE_ROUTES } from "@/lib/modules";
import { logout } from "@/app/login/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  const modules = await getUserModules(profile.id, profile.role_id);

  return (
    <div className="flex h-screen w-full bg-zinc-50 text-zinc-900">
      <aside className="flex w-60 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-14 items-center border-b border-zinc-200 px-4">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Mercado Nacional
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {modules.map((m) => (
            <Link
              key={m.id}
              href={MODULE_ROUTES[m.name] ?? "/"}
              className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-100"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded text-base"
                style={{ backgroundColor: (m.color ?? "#666") + "20" }}
              >
                {MODULE_ICONS[m.icon ?? ""] ?? "•"}
              </span>
              <span>{m.display_name}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
          <div className="text-sm text-zinc-600">
            {profile.role?.display_name}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">
                {profile.short_name ?? profile.full_name}
              </div>
              <div className="text-xs text-zinc-500">{profile.email}</div>
            </div>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: profile.color ?? "#666" }}
            >
              {profile.initials ?? "??"}
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Salir
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
