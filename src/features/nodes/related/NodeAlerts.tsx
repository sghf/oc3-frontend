import { useTranslation } from "react-i18next";
import { AlertsTable } from "@/components/opensvc/AlertsTable";
import { useNodeAlerts } from "./queries";

/** Alerts of the node, as the dashboard lists them. */
export function NodeAlerts({ nodeId, locale }: { nodeId: string; locale: string }) {
  const { t } = useTranslation();
  return (
    <AlertsTable
      alerts={useNodeAlerts(nodeId)}
      locale={locale}
      empty={t("nodes.alerts.empty")}
      caption={t("nodes.related.alerts")}
    />
  );
}
