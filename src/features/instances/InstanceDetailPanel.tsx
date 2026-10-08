import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailContent, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { RelatedTabsPanel } from "@/components/opensvc/RelatedTabsPanel";
import { INSTANCE_RELATED_TABS } from "./instance-related";
import { statusField } from "@/components/opensvc/status-field";
import { StatusTimeline } from "@/components/opensvc/StatusTimeline";
import { linkedField } from "@/components/opensvc/linked-field";
import { ObjectTags } from "@/components/opensvc/ObjectTags";
import { InstanceActionsMenu } from "./InstanceActionsMenu";
import { useServiceTags } from "@/features/services/related/queries";
import { useTagEdit } from "@/features/tags/use-tag-edit";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";
import { fromInstanceId, instanceName, pickInstanceRow } from "./instance-id";

type InstanceRow = components["schemas"]["InstanceRow"];

const text = (prop: keyof InstanceRow) => (row: InstanceRow) => {
  const value = row[prop];
  // A joined name is null when the joined row is missing.
  return value === undefined || value === null ? undefined : String(value);
};

const field = (prop: keyof InstanceRow) => ({ prop, format: text(prop) });

/** A size the agent reports as 0 when it does not apply: shown only when known. */
const nonZero = (prop: keyof InstanceRow) => ({
  prop,
  format: (row: InstanceRow) => {
    const value = row[prop];
    return value === undefined || value === null || Number(value) === 0 ? undefined : String(value);
  },
});

const date = (prop: keyof InstanceRow) => ({
  prop,
  format: (row: InstanceRow, locale: string) => {
    const value = row[prop];
    return typeof value === "string" ? formatDateTime(value, locale) : undefined;
  },
});

/** Detail of an instance, read-only: the agent is what holds its state. */
const GROUPS: DetailGroup<InstanceRow>[] = [
  {
    key: "identity",
    family: "service",
    fields: [
      linkedField<InstanceRow>(
        "services.svcname",
        "service",
        (row) => row.svc_id,
        text("services.svcname"),
      ),
      linkedField<InstanceRow>(
        "nodes.nodename",
        "node",
        (row) => row.node_id,
        text("nodes.nodename"),
      ),
      field("mon_svctype"),
      field("svc_id"),
      field("node_id"),
    ],
  },
  {
    key: "state",
    family: "state",
    fields: [
      statusField<InstanceRow>("mon_availstatus", (row) => row.mon_availstatus),
      statusField<InstanceRow>("mon_overallstatus", (row) => row.mon_overallstatus),
      field("mon_smon_status"),
      field("mon_smon_global_expect"),
      // 0 / 1 in the database: a real boolean, unlike the service's `svc_frozen`.
      { ...field("mon_frozen"), input: "boolean" as const },
      date("mon_frozen_at"),
      date("mon_encap_frozen_at"),
      date("mon_updated"),
      date("mon_changed"),
    ],
  },
  {
    key: "resources",
    family: "disk",
    fields: [
      statusField<InstanceRow>("mon_ipstatus", (row) => row.mon_ipstatus),
      statusField<InstanceRow>("mon_fsstatus", (row) => row.mon_fsstatus),
      statusField<InstanceRow>("mon_diskstatus", (row) => row.mon_diskstatus),
      statusField<InstanceRow>("mon_sharestatus", (row) => row.mon_sharestatus),
      statusField<InstanceRow>("mon_containerstatus", (row) => row.mon_containerstatus),
      statusField<InstanceRow>("mon_appstatus", (row) => row.mon_appstatus),
      statusField<InstanceRow>("mon_syncstatus", (row) => row.mon_syncstatus),
    ],
  },
  {
    key: "virtualization",
    family: "hypervisor",
    // The agent reports 0 vcpus and 0 memory for an instance that is no virtual
    // machine: not a value to show, so that the section is left out with nothing
    // in it.
    fields: [
      field("mon_vmname"),
      field("mon_vmtype"),
      field("mon_guestos"),
      nonZero("mon_vcpus"),
      nonZero("mon_vmem"),
    ],
  },
];

const PROPS = GROUPS.flatMap((group) => group.fields.map((f) => f.prop)).join(",");

/**
 * An instance: its properties, the instance status timeline at the end of its
 * state, and its resources in a tab. The open tab lives in the URL, held by the
 * view (`tab` from the list, `peektab` over another view).
 */
export function InstanceDetailPanel({
  instanceId,
  label,
  onClose,
  tab,
  onTabChange,
}: {
  instanceId: string | undefined;
  label: string;
  onClose: () => void;
  tab: string | undefined;
  onTabChange: (tab: string | undefined) => void;
}) {
  const { t, i18n } = useTranslation();
  const key = instanceId === undefined ? null : fromInstanceId(instanceId);
  const {
    data: instance,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["instance", instanceId],
    enabled: key !== null,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/services/{svc_id}/instances/{node_id}", {
        params: {
          path: { svc_id: key?.svcId ?? "", node_id: key?.nodeId ?? "" },
          query: { props: PROPS },
        },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: InstanceRow[] = Array.isArray(data.data) ? data.data : [];
      // An encapsulated service has one row per container: keep this one's.
      return pickInstanceRow(rows, key?.vmname) ?? null;
    },
  });

  // The tags are those of the instance's service: an instance carries none. Same
  // cache key as the service panel, which therefore sees the same changes.
  const svcId = key?.svcId;
  const tags = useServiceTags(svcId);
  const tagEdit = useTagEdit("service", svcId);

  const title =
    instance === undefined || instance === null
      ? label === ""
        ? t("instances.detail.title")
        : label
      : instanceName(
          instance["services.svcname"] ?? "",
          instance["nodes.nodename"] ?? "",
          instance.mon_vmname,
        );

  return (
    <RelatedTabsPanel
      open={instanceId !== undefined}
      title={title}
      kind="instance"
      onClose={onClose}
      objectId={instanceId}
      tabs={INSTANCE_RELATED_TABS}
      tab={tab}
      onTabChange={onTabChange}
      propertiesFamily="service"
      label={t("instances.detail.tabs")}
      titleActions={
        tagEdit.allowed && instanceId !== undefined ? (
          <InstanceActionsMenu
            instances={[{ id: instanceId, name: title }]}
            onDeleted={onClose}
            confirm="popover"
          />
        ) : undefined
      }
    >
      <ObjectTags
        tags={tags.data}
        isPending={svcId !== undefined && tags.isPending}
        errorMessage={tags.isError ? tags.error.message : null}
        edit={tagEdit}
      />
      <DetailContent
        groups={GROUPS}
        // A malformed URL id names nothing: it is said rather than waited on.
        row={key === null && instanceId !== undefined ? null : instance}
        labelPrefix="instances.fields"
        groupPrefix="instances.detail.groups"
        isPending={instanceId !== undefined && key !== null && isPending}
        errorMessage={isError ? error.message : null}
        editHint=""
        groupFooters={
          key === null
            ? undefined
            : {
                // Availability and overall status on two named tracks, at the end of
                // the state: the instance history the service panel leaves out.
                state: (
                  <StatusTimeline
                    queryKey={["instance", key.svcId, key.nodeId, "status-log"]}
                    locale={i18n.language}
                    tracks={[
                      { key: "avail", label: t("statusTimeline.avail") },
                      { key: "overall", label: t("statusTimeline.overall") },
                    ]}
                    load={async (days) => {
                      const { data, error: failure } = await api.GET(
                        "/services/{svc_id}/instances/{node_id}/status_log",
                        {
                          params: {
                            path: { svc_id: key.svcId, node_id: key.nodeId },
                            query: { days },
                          },
                        },
                      );
                      if (failure !== undefined) throw new Error(problemText(failure));
                      return {
                        periods: data.data.map((p) => ({
                          begin: p.begin,
                          end: p.end,
                          values: { avail: p.avail, overall: p.overall },
                        })),
                      };
                    }}
                  />
                ),
              }
        }
      />
    </RelatedTabsPanel>
  );
}
