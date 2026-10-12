import { useTranslation } from "react-i18next";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectCompliance } from "@/components/opensvc/ObjectCompliance";
import { useObjectLabels } from "@/components/opensvc/object-label";

/**
 * The compliance of a service instance: the last check of each module of the
 * service on the node of the instance. The modulesets and rulesets are those of
 * the service, shown without editing: they apply to all its instances, and change
 * in the service panel.
 */
export function InstanceCompliance({
  svcId,
  nodeId,
  locale,
}: {
  svcId: string;
  nodeId: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const [name = svcId] = useObjectLabels([{ kind: "service", id: svcId }]);
  return (
    <ObjectCompliance
      target={{ kind: "service", id: svcId }}
      locale={locale}
      groupStatusBy="none"
      statusFilter={(row) => row.node_id === nodeId}
      readOnlyHint={
        <span className="inline-flex flex-wrap items-center gap-1">
          {t("objectCompliance.instanceHint")}
          <CrossLink kind="service" id={svcId}>
            {name}
          </CrossLink>
        </span>
      }
    />
  );
}
