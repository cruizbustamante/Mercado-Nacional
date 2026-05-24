import { notFound } from "next/navigation";
import { loadOcDetail } from "../../../../_lib/queries";
import { OcDetailContent } from "../../../../oc/[id]/OcDetailContent";
import { OcModal } from "./OcModal";

export default async function InterceptedOcPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const oc = await loadOcDetail(id);
  if (!oc) notFound();

  return (
    <OcModal id={id}>
      <OcDetailContent oc={oc} mode="modal" />
    </OcModal>
  );
}
