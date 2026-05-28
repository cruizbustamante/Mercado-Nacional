"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface Option {
  value: string;
  label: string;
}

export function FilterSelect({
  paramName,
  value,
  placeholder,
  options,
}: {
  paramName: string;
  value: string;
  placeholder: string;
  options: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const onChange = (next: string) => {
    const params = new URLSearchParams(sp.toString());
    if (next) params.set(paramName, next);
    else params.delete(paramName);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs bg-bg-base border border-line rounded-md px-2 py-1 text-ink-2 focus:outline-none focus:border-ink-2"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
