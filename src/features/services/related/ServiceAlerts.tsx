import { useTranslation } from "react-i18next";
import { AlertsTable } from "@/components/opensvc/AlertsTable";
import { useServiceAlerts } from "./queries";

/** Alerts of the service, as the dashboard lists them. */
export function ServiceAlerts({ svcId, locale }: { svcId: string; locale: string }) {
  const { t } = useTranslation();
  return (
    <AlertsTable
      alerts={useServiceAlerts(svcId)}
      locale={locale}
      empty={t("services.alerts.empty")}
      caption={t("services.related.alerts")}
    />
  );
}
