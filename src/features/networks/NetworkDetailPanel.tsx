import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";

type IpRow = components["schemas"]["IpRow"];

const text = (prop: keyof IpRow) => (row: IpRow) => {
  const value = row[prop];
  return value === undefined ? undefined : String(value);
};

const field = (prop: keyof IpRow, format?: (row: IpRow, locale: string) => string | undefined) => ({
  prop,
  format: format ?? text(prop),
});

const GROUPS: DetailGroup<IpRow>[] = [
  {
    key: "address",
    family: "network",
    fields: [
      field("addr"),
      field("mask"),
      field("type"),
      field("intf"),
      field("mac"),
      linkedField<IpRow>("nodename", "node", (row) => row.node_id, text("nodename")),
      field("node_id"),
      { ...field("flag_deprecated"), input: "boolean" as const },
      field("updated", (row) => formatDateTime(row.updated)),
      field("id"),
    ],
  },
  {
    key: "network",
    family: "cluster",
    fields: [
      field("net_name"),
      field("net_network"),
      field("net_netmask"),
      field("net_broadcast"),
      field("net_gateway"),
      field("net_begin"),
      field("net_end"),
      field("net_pvid"),
      field("net_prio"),
      field("net_team_responsible"),
      field("net_comment"),
      field("net_id"),
    ],
  },
];

const PROPS = GROUPS.flatMap((group) => group.fields.map((f) => f.prop)).join(",");

export function NetworkDetailPanel({
  ipId,
  label,
  onClose,
}: {
  ipId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    data: ip,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["ip", ipId],
    enabled: ipId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/ips/{id}", {
        params: { path: { id: ipId ?? "" }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(JSON.stringify(failure));
      const rows: IpRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  // Deletes the reading, not the address: a node still reporting this address will
  // write it back at its next inventory push.
  const remove = useMutation({
    mutationFn: async () => {
      const { error: failure } = await api.DELETE("/ips/{id}", {
        params: { path: { id: ipId ?? "" } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ips"] });
      onClose();
    },
  });

  return (
    <DetailPanel
      kind="network"
      recordId={ipId}
      open={ipId !== undefined}
      title={ip?.addr ?? (label === "" ? t("networks.detail.title") : label)}
      onClose={onClose}
      groups={GROUPS}
      row={ip}
      labelPrefix="networks.fields"
      groupPrefix="networks.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      actions={
        <>
          <ConfirmButton
            icon={<TrashIcon />}
            label={t("detail.delete")}
            question={t("networks.delete.question", {
              addr: ip?.addr ?? "",
              nodename: ip?.nodename ?? "",
            })}
            confirmLabel={t("detail.deleteConfirm")}
            cancelLabel={t("detail.cancel")}
            pendingLabel={t("detail.deleting")}
            pending={remove.isPending}
            onConfirm={() => {
              remove.mutate();
            }}
          />
          {remove.isError && (
            <p role="alert" className="mt-2 text-state-down">
              ■ {remove.error.message}
            </p>
          )}
        </>
      }
    />
  );
}
