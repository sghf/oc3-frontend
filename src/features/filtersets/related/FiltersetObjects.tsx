import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { FrozenMark } from "@/components/opensvc/FrozenMark";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { statusBadge } from "@/components/opensvc/status";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { SearchIcon } from "@/components/ui/icons";
import { FILTERSET_OBJECTS_LIMIT, useFiltersetNodes, useFiltersetServices } from "../filterset-api";

type NodeRow = components["schemas"]["NodeRow"];
type ServiceRow = components["schemas"]["ServiceRow"];

/** Pause in the typing after which the list is narrowed. */
const TYPING_DELAY = 300;

/** The text typed, and the one the list is narrowed by, after a pause. */
function useNarrowing() {
  const [typed, setTyped] = useState("");
  const [narrow, setNarrow] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNarrow(typed.trim());
    }, TYPING_DELAY);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed]);
  return { typed, setTyped, narrow };
}

/** Above a list of matching objects: the field narrowing it by name. */
function ObjectsSearch({
  typed,
  onType,
  placeholder,
}: {
  typed: string;
  onType: (text: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-2 flex h-7 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted focus-within:border-accent">
      <SearchIcon />
      <input
        type="search"
        value={typed}
        onChange={(event) => {
          onType(event.target.value);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-muted"
      />
    </div>
  );
}

/** Under a list: how much of it shows, when the limit cut it. */
function Shown({ count, hasMore }: { count: number; hasMore: boolean }) {
  const { t } = useTranslation();
  if (!hasMore) return null;
  return (
    <p className="mt-2 text-ink-muted">
      {t("filtersets.objects.firstOnly", { count: count === 0 ? FILTERSET_OBJECTS_LIMIT : count })}
    </p>
  );
}

/**
 * The nodes a filterset selects, by name: the object and its freezing, its app,
 * environment, system, asset status and last contact. Narrowed by name on the
 * server, so that a filterset selecting thousands of nodes stays readable.
 */
export function FiltersetNodes({ filtersetId, locale }: { filtersetId: string; locale: string }) {
  const { t } = useTranslation();
  const { typed, setTyped, narrow } = useNarrowing();
  const nodes = useFiltersetNodes(filtersetId, narrow);
  const rows = nodes.data?.rows ?? [];
  const columns: RelatedColumn<NodeRow>[] = [
    {
      key: "nodename",
      label: t("nodes.fields.nodename"),
      render: (row) => (
        <span className="flex items-center gap-1">
          <CrossLink kind="node" id={row.node_id}>
            {row.nodename}
          </CrossLink>
          <FrozenMark frozen={row.node_frozen === "T"} />
        </span>
      ),
    },
    {
      key: "app",
      label: t("nodes.fields.app"),
      render: (row) =>
        row.app === undefined || row.app === null || row.app === "" ? null : (
          <CrossLink kind="app" id={row.app}>
            {row.app}
          </CrossLink>
        ),
    },
    { key: "node_env", label: t("nodes.fields.node_env"), render: (row) => row.node_env },
    {
      key: "os_concat",
      label: t("nodes.fields.os_concat"),
      grow: true,
      render: (row) => row.os_concat,
    },
    // The asset status, as the inventory records it ("Prod"…): free text, not a state.
    { key: "status", label: t("nodes.fields.status"), render: (row) => row.status },
    {
      key: "last_comm",
      label: t("nodes.fields.last_comm"),
      render: (row) =>
        typeof row.last_comm === "string" && row.last_comm !== "" ? (
          <RelativeTime value={row.last_comm} locale={locale} />
        ) : null,
    },
  ];
  return (
    <div>
      <ObjectsSearch
        typed={typed}
        onType={setTyped}
        placeholder={t("filtersets.objects.findNode")}
      />
      <RelatedTable
        columns={columns}
        groups={[{ key: "all", label: "", rows }]}
        rowKey={(row) => row.node_id ?? row.nodename ?? ""}
        isPending={nodes.isPending}
        errorMessage={nodes.isError ? nodes.error.message : null}
        empty={narrow === "" ? t("filtersets.objects.noNode") : t("filtersets.objects.noMatch")}
        caption={t("filtersets.related.nodes")}
      />
      <Shown count={rows.length} hasMore={nodes.data?.hasMore === true} />
    </div>
  );
}

/** The services a filterset selects, by name, as `FiltersetNodes`. */
export function FiltersetServices({ filtersetId }: { filtersetId: string }) {
  const { t } = useTranslation();
  const { typed, setTyped, narrow } = useNarrowing();
  const services = useFiltersetServices(filtersetId, narrow);
  const rows = services.data?.rows ?? [];
  const columns: RelatedColumn<ServiceRow>[] = [
    {
      key: "svcname",
      label: t("services.fields.svcname"),
      grow: true,
      render: (row) => (
        <CrossLink kind="service" id={row.svc_id}>
          {row.svcname}
        </CrossLink>
      ),
    },
    {
      key: "svc_app",
      label: t("services.fields.svc_app"),
      render: (row) =>
        row.svc_app === undefined || row.svc_app === null || row.svc_app === "" ? null : (
          <CrossLink kind="app" id={row.svc_app}>
            {row.svc_app}
          </CrossLink>
        ),
    },
    { key: "svc_env", label: t("services.fields.svc_env"), render: (row) => row.svc_env },
    {
      key: "svc_status",
      label: t("services.fields.svc_status"),
      render: (row) =>
        typeof row.svc_status === "string" && row.svc_status !== "" ? (
          <StatusBadge {...statusBadge(row.svc_status)} />
        ) : null,
    },
    {
      key: "svc_availstatus",
      label: t("services.fields.svc_availstatus"),
      render: (row) =>
        typeof row.svc_availstatus === "string" && row.svc_availstatus !== "" ? (
          <StatusBadge {...statusBadge(row.svc_availstatus)} />
        ) : null,
    },
  ];
  return (
    <div>
      <ObjectsSearch
        typed={typed}
        onType={setTyped}
        placeholder={t("filtersets.objects.findService")}
      />
      <RelatedTable
        columns={columns}
        groups={[{ key: "all", label: "", rows }]}
        rowKey={(row) => row.svc_id ?? row.svcname ?? ""}
        isPending={services.isPending}
        errorMessage={services.isError ? services.error.message : null}
        empty={narrow === "" ? t("filtersets.objects.noService") : t("filtersets.objects.noMatch")}
        caption={t("filtersets.related.services")}
      />
      <Shown count={rows.length} hasMore={services.data?.hasMore === true} />
    </div>
  );
}
