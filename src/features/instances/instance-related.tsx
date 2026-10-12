import { useTranslation } from "react-i18next";
import { ColumnFamilyIcon } from "@/components/opensvc/ColumnFamily";
import type { RelatedTab } from "@/components/opensvc/related-tabs";
import { resourceStatusSummary } from "@/features/services/related/resource-status";
import { actionStatusSummary } from "@/features/services/related/action-status";
import { ServiceActions } from "@/features/services/related/ServiceActions";
import { useServiceActionStats } from "@/features/services/related/queries";
import { GearIcon } from "@/components/ui/icons";
import { fromInstanceId } from "./instance-id";
import { InstanceCompliance } from "./InstanceCompliance";
import { InstanceResources } from "./InstanceResources";
import { nokCount, useCompStatus } from "@/lib/api/object-compliance";
import { useInstanceResources } from "./use-instance-resources";

/** Data attached to an instance, one tab each, on the model of the service. */
export const INSTANCE_RELATED_TABS: RelatedTab[] = [
  {
    key: "resources",
    labelKey: "services.related.resources",
    icon: <ColumnFamilyIcon family="resource" />,
    useSummary: (instanceId) => {
      const { t } = useTranslation();
      return resourceStatusSummary(useInstanceResources(instanceId).data, t);
    },
    render: (instanceId, locale) => <InstanceResources instanceId={instanceId} locale={locale} />,
  },
  {
    key: "actions",
    labelKey: "services.related.actions",
    // The gear of the historical actions tab (`action16`), as on the service.
    icon: <GearIcon className="h-4 w-4 shrink-0 text-icon-service" />,
    // The actions of the service on the node of the instance. The agent does not
    // file them by container: the containers of a node share theirs.
    useSummary: (instanceId) => {
      const { t } = useTranslation();
      const key = instanceId === undefined ? null : fromInstanceId(instanceId);
      return actionStatusSummary(useServiceActionStats(key?.svcId, key?.nodeId).data, t);
    },
    render: (instanceId, locale) => {
      const key = fromInstanceId(instanceId);
      return key === null ? null : (
        <ServiceActions svcId={key.svcId} nodeId={key.nodeId} locale={locale} />
      );
    },
  },
  {
    key: "compliance",
    labelKey: "nodes.related.compliance",
    icon: <ColumnFamilyIcon family="moduleset" />,
    // The checks of the service on the node of the instance: the containers of a
    // node share them, as the agent files them by node.
    useSummary: (instanceId) => {
      const { t } = useTranslation();
      const key = instanceId === undefined ? null : fromInstanceId(instanceId);
      const rows = useCompStatus(
        key === null ? undefined : { kind: "service", id: key.svcId },
      ).data?.filter((row) => row.node_id === key?.nodeId);
      const count = nokCount(rows);
      return {
        count: rows?.length,
        parts: [
          {
            key: "nok",
            count,
            box: "bg-state-down-soft text-state-down",
            label: t("objectCompliance.status.nokCount", { count }),
          },
        ],
      };
    },
    render: (instanceId, locale) => {
      const key = fromInstanceId(instanceId);
      return key === null ? null : (
        <InstanceCompliance svcId={key.svcId} nodeId={key.nodeId} locale={locale} />
      );
    },
  },
];
