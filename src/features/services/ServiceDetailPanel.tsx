import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { DetailContent, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { statusField } from "@/components/opensvc/status-field";
import { AvailabilityRate } from "@/components/opensvc/AvailabilityRate";
import { formatPercent } from "@/lib/format";
import { linkedField } from "@/components/opensvc/linked-field";
import { NodeNameLinks } from "@/components/opensvc/NodeNameLinks";
import { ObjectTags } from "@/components/opensvc/ObjectTags";
import { useTagEdit } from "@/features/tags/use-tag-edit";
import { RelatedTabsPanel } from "@/components/opensvc/RelatedTabsPanel";
import { StatusTimeline } from "@/components/opensvc/StatusTimeline";
import { ServiceActionsMenu } from "./ServiceActionsMenu";
import { useServiceTags } from "./related/queries";
import { SERVICE_RELATED_TABS } from "./related/service-related";
import { formatDateTime } from "@/lib/format";

type ServiceRow = components["schemas"]["ServiceRow"];

const text = (prop: keyof ServiceRow) => (row: ServiceRow) => {
  const value = row[prop];
  return value === undefined ? undefined : String(value);
};

const date = (prop: keyof ServiceRow) => (row: ServiceRow, locale: string) => {
  const value = row[prop];
  return typeof value === "string" ? formatDateTime(value, locale) : undefined;
};

const field = (
  prop: keyof ServiceRow,
  format?: (row: ServiceRow, locale: string) => string | undefined,
) => ({ prop, format: format ?? text(prop) });

/**
 * Booleans shown as a switch, read-only: the daemon keeps them up to date.
 *
 * `svc_frozen` and `svc_provisioned` are not among them: they are states with
 * several values on the om3 side — "frozen", "unfrozen", "mixed", "n/a" for one,
 * "true", "false", "mixed", "n/a" for the other — which a switch cannot represent.
 */
const flag = (prop: keyof ServiceRow) => ({ ...field(prop), input: "boolean" as const });

const GROUPS: DetailGroup<ServiceRow>[] = [
  {
    key: "identity",
    family: "service",
    fields: [
      field("svcname"),
      field("svc_id"),
      linkedField<ServiceRow>("svc_app", "app", (row) => row.svc_app, text("svc_app")),
      field("svc_env"),
      field("cluster_id"),
      field("svc_comment"),
    ],
  },
  {
    key: "state",
    family: "state",
    fields: [
      statusField<ServiceRow>("svc_availstatus", (row) => row.svc_availstatus),
      statusField<ServiceRow>("svc_status", (row) => row.svc_status),
      // The availability target the Services view flags the rate against; set by
      // the responsibles of the service, empty to remove it.
      {
        prop: "svc_sla",
        format: (row) => (typeof row.svc_sla === "number" ? String(row.svc_sla) : undefined),
        render: (row, locale) =>
          typeof row.svc_sla === "number" ? formatPercent(row.svc_sla, locale, 3) : null,
        editable: true,
      },
      {
        prop: "svc_availability",
        format: (row) =>
          typeof row.svc_availability === "number" ? String(row.svc_availability) : undefined,
        // Flagged against the SLA, as in the Services view.
        render: (row, locale) =>
          typeof row.svc_availability === "number" ? (
            <AvailabilityRate rate={row.svc_availability} sla={row.svc_sla} locale={locale} />
          ) : null,
      },
      field("svc_frozen"),
      field("svc_provisioned"),
      field("svc_status_updated", date("svc_status_updated")),
      field("svc_snooze_till", date("svc_snooze_till")),
      flag("svc_notifications"),
    ],
  },
  {
    key: "placement",
    family: "node",
    fields: [
      field("svc_topology"),
      field("svc_placement"),
      {
        ...field("svc_nodes"),
        render: (row) => <NodeNameLinks names={row.svc_nodes ?? ""} clusterId={row.cluster_id} />,
      },
      flag("svc_ha"),
      field("svc_autostart"),
      field("svc_flex_min_nodes"),
      field("svc_flex_max_nodes"),
      field("svc_flex_target"),
      field("svc_flex_cpu_low_threshold"),
      field("svc_flex_cpu_high_threshold"),
      field("svc_wave"),
    ],
  },
  {
    key: "disasterRecovery",
    family: "drp",
    fields: [
      field("svc_drpnode"),
      field("svc_drpnodes"),
      field("svc_drptype"),
      field("svc_metrocluster"),
      flag("svc_drnoaction"),
    ],
  },
  {
    key: "collector",
    family: "service",
    fields: [
      field("svc_created", date("svc_created")),
      field("svc_config_updated", date("svc_config_updated")),
      field("updated", date("updated")),
      field("svc_hostid"),
    ],
  },
];

// Ask the collector only for the properties actually shown.
const PROPS = GROUPS.flatMap((group) => group.fields.map((f) => f.prop)).join(",");

/**
 * Detail of a service: its properties, then its related data, one tab each
 * (`SERVICE_RELATED_TABS`). The open tab lives in the URL (`tab`), held by the view.
 */
export function ServiceDetailPanel({
  svcId,
  svcname,
  onClose,
  tab,
  onTabChange,
}: {
  svcId: string | undefined;
  svcname: string;
  onClose: () => void;
  tab: string | undefined;
  onTabChange: (tab: string | undefined) => void;
}) {
  const { t, i18n } = useTranslation();
  const {
    data: service,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["service", svcId],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/services/{svc_id}", {
        params: { path: { svc_id: svcId ?? "" }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(JSON.stringify(failure));
      const rows: ServiceRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const open = svcId !== undefined;
  const tags = useServiceTags(svcId);
  const tagEdit = useTagEdit("service", svcId);
  const queryClient = useQueryClient();
  // The owners of the service justify its periods of unavailability.
  const responsible = useQuery({
    queryKey: ["service", svcId, "responsible"],
    enabled: svcId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/services/{svc_id}/am_i_responsible", {
        params: { path: { svc_id: svcId ?? "" } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      return data.data === true;
    },
  });

  return (
    <RelatedTabsPanel
      open={open}
      title={service?.svcname ?? (svcname === "" ? t("services.detail.title") : svcname)}
      kind="service"
      onClose={onClose}
      objectId={svcId}
      tabs={SERVICE_RELATED_TABS}
      tab={tab}
      onTabChange={onTabChange}
      propertiesFamily="service"
      label={t("services.related.label")}
      titleActions={
        tagEdit.allowed && svcId !== undefined ? (
          <ServiceActionsMenu
            services={[{ id: svcId, name: service?.svcname ?? svcId }]}
            onDeleted={onClose}
            confirm="popover"
          />
        ) : undefined
      }
    >
      <ObjectTags
        tags={tags.data}
        isPending={open && tags.isPending}
        errorMessage={tags.isError ? tags.error.message : null}
        edit={tagEdit}
      />
      <DetailContent
        groups={GROUPS}
        row={service}
        labelPrefix="services.fields"
        groupPrefix="services.detail.groups"
        isPending={open && isPending}
        errorMessage={isError ? error.message : null}
        editHint=""
        onSave={async (changes) => {
          if (svcId === undefined) return;
          const sla = changes.svc_sla;
          if (typeof sla !== "string") return;
          const { error: failure } = await api.POST("/services/{svc_id}", {
            params: { path: { svc_id: svcId } },
            body: { svc_sla: sla },
          });
          if (failure !== undefined) throw new Error(problemText(failure));
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["service", svcId] }),
            queryClient.invalidateQueries({ queryKey: ["services"] }),
          ]);
        }}
        groupFooters={
          svcId === undefined
            ? undefined
            : {
                // The availability of the service only: the instance statuses are
                // in the instance panels, the resources in their tab.
                state: (
                  <StatusTimeline
                    queryKey={["service", svcId, "status-log"]}
                    locale={i18n.language}
                    tracks={[{ key: "avail", label: t("statusTimeline.avail") }]}
                    load={async (days) => {
                      const { data, error: failure } = await api.GET(
                        "/services/{svc_id}/status_log",
                        { params: { path: { svc_id: svcId }, query: { days } } },
                      );
                      if (failure !== undefined) throw new Error(problemText(failure));
                      return {
                        periods: data.data.map((p) => ({
                          begin: p.begin,
                          end: p.end,
                          values: { avail: p.status },
                          ack:
                            p.ack === undefined
                              ? undefined
                              : {
                                  comment: p.ack.comment,
                                  account: p.ack.account,
                                  by: p.ack.acked_by,
                                  on: p.ack.acked_on,
                                },
                        })),
                        availability: {
                          rate: data.availability.rate,
                          from: data.availability.from,
                          excludedSeconds: data.availability.excluded_s,
                        },
                      };
                    }}
                    justify={{
                      track: "avail",
                      canEdit: responsible.data === true,
                      save: async (begin, end, comment, account) => {
                        const { error: failure } = await api.PUT(
                          "/services/{svc_id}/status_log/ack",
                          {
                            params: { path: { svc_id: svcId } },
                            body: { begin, end, comment, account },
                          },
                        );
                        return failure === undefined ? null : problemText(failure);
                      },
                      remove: async (begin, end) => {
                        const { error: failure } = await api.DELETE(
                          "/services/{svc_id}/status_log/ack",
                          {
                            params: { path: { svc_id: svcId }, query: { begin, end } },
                          },
                        );
                        return failure === undefined ? null : problemText(failure);
                      },
                    }}
                  />
                ),
              }
        }
      />
    </RelatedTabsPanel>
  );
}
