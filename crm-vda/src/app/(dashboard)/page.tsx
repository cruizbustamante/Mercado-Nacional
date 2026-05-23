import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getUserModules } from "@/lib/auth";
import { MODULE_ICONS, MODULE_ROUTES } from "@/lib/modules";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const modules = await getUserModules(profile.id, profile.role_id);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {profile.short_name ?? profile.full_name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {profile.role?.display_name} · {modules.length} módulos disponibles
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link
            key={m.id}
            href={MODULE_ROUTES[m.name] ?? "/"}
            className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-white p-5 transition hover:shadow-md"
          >
            <div
              className="absolute left-0 top-0 h-full w-1"
              style={{ backgroundColor: m.color ?? "#666" }}
            />
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-md text-2xl"
                style={{ backgroundColor: (m.color ?? "#666") + "15" }}
              >
                {MODULE_ICONS[m.icon ?? ""] ?? "•"}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-medium text-zinc-900 group-hover:text-zinc-700">
                  {m.display_name}
                </h2>
                {m.description && (
                  <p className="mt-1 text-xs text-zinc-500">{m.description}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
