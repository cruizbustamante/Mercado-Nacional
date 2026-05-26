import { notFound } from "next/navigation";
import { loadOcDetail } from "../../../../_lib/queries";
import { getLogisticsCostMap } from "@/lib/supermarket-logistics";
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

  const brandIds = oc.items
    .map((it) => it.product?.brand_id)
    .filter((b): b is string => !!b);
  const chainId = oc.chain?.id ?? null;
  const logisticsMap = await getLogisticsCostMap(brandIds, chainId);
  const logisticsCosts = Object.fromEntries(logisticsMap);

  return (
    <OcModal id={id}>
      <OcDetailContent oc={oc} mode="modal" logisticsCosts={logisticsCosts} />
    </OcModal>
  );
}
