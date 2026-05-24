import { ConfigNav } from "./ConfigNav";

export default function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <ConfigNav />
      {children}
    </div>
  );
}
