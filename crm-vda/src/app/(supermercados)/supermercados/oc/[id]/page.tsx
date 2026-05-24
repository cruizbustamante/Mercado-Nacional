import { notFound } from "next/navigation";
import { loadOcDetail } from "../../_lib/queries";
import { OcDetailContent } from "./OcDetailContent";

export const revalidate = 60;

export default async function OcDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const oc = await loadOcDetail(id);
  if (!oc) notFound();
  return (
    <main className="content">
      <OcDetailContent oc={oc} mode="page" />
    </main>
  );
}
