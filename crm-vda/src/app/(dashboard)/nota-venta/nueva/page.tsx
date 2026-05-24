import Link from "next/link";
import { StubModule } from "../../_stub/StubModule";

export default function NuevaNVPage() {
  return (
    <div>
      <nav className="mb-4 text-sm">
        <Link href="/nota-venta" className="text-zinc-500 hover:text-zinc-900">
          ← Volver a Notas de Venta
        </Link>
      </nav>
      <StubModule
        title="Emisión Nota de Venta"
        desc="El formulario de emisión está en construcción — siguiente entrega con el diseño completo (selección de cliente, productos, cálculos en vivo, validación de V°B°)."
      />
    </div>
  );
}
