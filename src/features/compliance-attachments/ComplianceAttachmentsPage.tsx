import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ActionsMenu,
  type ActionTarget,
  type DataActionEntry,
} from "@/components/opensvc/ActionsMenu";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { CategoryTabs } from "@/components/ui/CategoryTabs";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { FlagSwitch } from "@/components/opensvc/FlagSwitch";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import {
  BIT_FLAG_FILTER_OPTIONS,
  FLAG_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "@/components/opensvc/filter-options";
import { statusBadge } from "@/components/opensvc/status";
import { filtersKey } from "@/lib/column-filters";
import {
  mergeSearch,
  resetsScroll,
  resolveListSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import {
  applyPairs,
  attachableObjects,
  attachmentStats,
  fetchAllAttachments,
  fetchAttachments,
  type AttachmentPair,
} from "./queries";
import {
  attachmentRowId,
  attachmentRowName,
  defaultColumns,
  queryProps,
  TABLE_KEYS,
  TABLES,
  toTableKey,
  type AttachmentRow,
  type TableDef,
} from "./tables";

/** The columns of the target, after its name and the object, in the order of its own list. */
const NODE_PROPS = [
  "app",
  "node_env",
  "asset_env",
  "team_responsible",
  "os_name",
  "os_release",
  "status",
  "role",
  "loc_country",
  "loc_city",
] as const;
const SERVICE_PROPS = [
  "svc_app",
  "svc_env",
  "svc_status",
  "svc_availstatus",
  "svc_ha",
  "svc_topology",
] as const;

const FAMILY: Record<string, ColumnFamily> = {
  nodename: "node",
  svcname: "service",
  modset_name: "moduleset",
  ruleset_name: "ruleset",
  slave: "hypervisor",
  app: "app",
  svc_app: "app",
  node_env: "env",
  asset_env: "env",
  svc_env: "env",
  team_responsible: "team",
  os_name: "os",
  os_release: "os",
  status: "state",
  role: "node",
  loc_country: "location",
  loc_city: "location",
  svc_status: "state",
  svc_availstatus: "state",
  svc_ha: "cluster",
  svc_topology: "cluster",
};

/** The columns of a table: the target, the object, the encapsulated part, the target's own. */
function tableColumns(table: TableDef): ListColumn<AttachmentRow>[] {
  const fieldKey = (prop: string) =>
    prop === "slave"
      ? "complianceAttachments.fields.slave"
      : prop === table.objectNameProp
        ? `complianceAttachments.fields.${table.object}`
        : `${table.target === "node" ? "nodes" : "services"}.fields.${prop}`;
  const column = (prop: string): ListColumn<AttachmentRow> => ({
    prop,
    labelKey: fieldKey(prop),
    family: FAMILY[prop] ?? (table.target === "node" ? "node" : "service"),
    filter:
      prop === "svc_status" || prop === "svc_availstatus"
        ? { kind: "enum", options: STATUS_FILTER_OPTIONS }
        : prop === "slave"
          ? { kind: "enum", options: FLAG_FILTER_OPTIONS }
          : prop === "svc_ha"
            ? { kind: "enum", options: BIT_FLAG_FILTER_OPTIONS }
            : undefined,
    render: (row) => {
      const value = row.values[prop];
      if (prop === table.targetNameProp)
        return (
          <CrossLink kind={table.target} id={row.targetId}>
            {row.targetName}
          </CrossLink>
        );
      if (prop === table.objectNameProp)
        return (
          <CrossLink kind={table.object} id={row.objectId}>
            {row.objectName}
          </CrossLink>
        );
      if (prop === "slave")
        return row.objectId === undefined ? null : (
          <FlagSwitch value={row.slave ? "T" : "F"} labelKey="complianceAttachments.fields.slave" />
        );
      if (prop === "app" || prop === "svc_app")
        return (
          <CrossLink kind="app" id={typeof value === "string" ? value : undefined}>
            {value}
          </CrossLink>
        );
      if (prop === "svc_ha")
        return (
          <FlagSwitch
            value={typeof value === "number" ? value : undefined}
            labelKey="services.fields.svc_ha"
          />
        );
      if ((prop === "svc_status" || prop === "svc_availstatus") && typeof value === "string")
        return <StatusBadge {...statusBadge(value)} />;
      return typeof value === "boolean" ? String(value) : value;
    },
  });
  const props =
    table.target === "node"
      ? [table.targetNameProp, table.objectNameProp, ...NODE_PROPS]
      : [table.targetNameProp, "slave", table.objectNameProp, ...SERVICE_PROPS];
  return props.map(column);
}

/**
 * The attachments of the modulesets and the rulesets, as the four Compliance
 * tables of the historical collector (`comp_modulesets_nodes` and the like): one
 * row per node or service and object attached, one with no object for a target
 * that has none, so that every target can be found and attached to. The columns,
 * filters and sort of the lists; on the selection, the Actions menu attaches a
 * moduleset or a ruleset to the targets of the rows, or detaches the objects of
 * the rows, as one batch the collector checks pair by pair
 * (`POST /compliance/attachments`).
 */
export function ComplianceAttachmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const raw = useSearch({ from: "/compliance/attachments" });
  const table = TABLES[toTableKey(raw.of)];
  const prefs = useViewPrefs(`compliance-attachments-${table.key}`);
  const search = resolveListSearch(withSavedSearch(raw, prefs), [
    table.targetNameProp,
    table.objectNameProp,
  ]);
  const navigate = useNavigate({ from: "/compliance/attachments" });
  const columns = useMemo(() => tableColumns(table), [table]);
  const defaults = useMemo(() => defaultColumns(table), [table]);
  const props = queryProps(
    table,
    visibleProps(
      search.cols,
      defaults,
      columns.map((column) => column.prop),
    ),
  );

  const list = useQuery({
    queryKey: [
      "compliance-attachments",
      table.key,
      props,
      search.sort,
      search.offset,
      search.limit,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchAttachments(table, props, search),
  });

  // The rows met, by id: those of the pages seen and of "select all", which the
  // actions read their target and object from.
  const known = useRef(new Map<string, AttachmentRow>());
  for (const row of list.data?.rows ?? []) known.current.set(attachmentRowId(row), row);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [unselect, setUnselect] = useState<string[]>([]);

  function update(next: Partial<ResolvedListSearch>) {
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => ({ ...mergeSearch(previous, next), of: previous.of }),
      resetScroll: resetsScroll(next),
    });
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["compliance-attachments"] });
    void queryClient.invalidateQueries({ queryKey: [table.target] });
  };
  const targets: ActionTarget[] = selectedIds.map((id) => {
    const row = known.current.get(id);
    return { id, name: row === undefined ? id : attachmentRowName(row) };
  });

  return (
    <section>
      {/* As tall as the Actions button from the start: checking a row must not push the list down. */}
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="compAttachment" className="h-5 w-5" />
          {t("complianceAttachments.title")}
        </h1>
        <ActionsMenu
          targets={targets}
          dataActions={attachmentActions(table, known.current, t, refresh, (ids) => {
            setUnselect(ids);
          })}
          prefix="complianceAttachments.actions"
        />
      </div>
      <p className="mb-3 max-w-4xl text-ink-muted">{t("complianceAttachments.intro")}</p>
      <div className="mb-3">
        <CategoryTabs
          label={t("complianceAttachments.tables.label")}
          idPrefix="compliance-attachments"
          tabs={TABLE_KEYS.map((key) => ({
            key,
            label: t(`complianceAttachments.tables.${key}`),
            icon: <ObjectIcon kind={TABLES[key].target} className="h-3.5 w-3.5" />,
          }))}
          active={table.key}
          onSelect={(key) => {
            setSelectedIds([]);
            // Each table has its own columns: its own sort, filters and page too.
            void navigate({ search: { of: key } });
          }}
        />
      </div>
      <CollectorList
        key={table.key}
        columns={columns}
        defaultCols={defaults}
        rows={list.data?.rows ?? []}
        rowId={attachmentRowId}
        search={search}
        onChange={update}
        isPending={list.isPending}
        isFetching={list.isFetching}
        errorMessage={list.isError ? list.error.message : null}
        hasMore={list.data?.hasMore ?? false}
        total={list.data?.total}
        exportPage={(page) =>
          fetchAttachments(table, queryProps(table, page.cols), { ...search, ...page })
        }
        onSelectionChange={setSelectedIds}
        selectAllMatching={async () => {
          const rows = await fetchAllAttachments(table, queryProps(table, []), search.filters);
          for (const row of rows) known.current.set(attachmentRowId(row), row);
          return rows.map(attachmentRowId);
        }}
        unselect={unselect}
        valueStats={(prop, filters) => attachmentStats(table, prop, filters)}
        filterable
      />
    </section>
  );
}

/**
 * The actions on the selected rows: attaching a moduleset or a ruleset to their
 * targets, each target once however many rows it has; detaching the objects of the
 * rows. Each is one batch, whose refusals name their row.
 */
function attachmentActions(
  table: TableDef,
  rows: ReadonlyMap<string, AttachmentRow>,
  t: TFunction,
  refresh: () => void,
  onChanged: (ids: string[]) => void,
): DataActionEntry[] {
  const pairOf = (row: AttachmentRow, objectId: string): AttachmentPair =>
    table.target === "node"
      ? { object: table.object, object_id: objectId, node_id: row.targetId }
      : { object: table.object, object_id: objectId, svc_id: row.targetId, slave: row.slave };
  // A refusal as the menu reports them: "name: reason".
  const failure = (name: string, message: string) =>
    t("complianceAttachments.actions.failure", { name, message });

  return [
    {
      key: "attach",
      privileges: ["CompExec"],
      tone: "change",
      choice: {
        queryKey: ["compliance-attachments", "objects", table.object],
        load: () => attachableObjects(table.object),
      },
      runAll: async (targets, choice) => {
        if (choice === undefined) return { done: [], failures: [] };
        // One pair per target and part: a node of several rows is attached once.
        const pairKey = (row: AttachmentRow) => `${row.targetId}|${row.slave ? "T" : ""}`;
        const byPair = new Map<string, AttachmentRow>();
        for (const target of targets) {
          const row = rows.get(target.id);
          if (row !== undefined) byPair.set(pairKey(row), row);
        }
        const chosen = [...byPair.values()];
        const outcomes = await applyPairs(
          "attach",
          chosen.map((row) => pairOf(row, choice.value)),
        );
        const done: ActionTarget[] = [];
        const failures: string[] = [];
        const attached = new Set<string>();
        outcomes.forEach((outcome, index) => {
          const row = chosen[index];
          if (row === undefined) return;
          if (outcome.status < 400) {
            done.push({ id: attachmentRowId(row), name: row.targetName });
            attached.add(pairKey(row));
          } else failures.push(failure(row.targetName, outcome.info));
        });
        // A row without object becomes one with it: its id changes, it leaves the selection.
        onChanged(
          targets.flatMap((target) => {
            const row = rows.get(target.id);
            return row !== undefined && row.objectId === undefined && attached.has(pairKey(row))
              ? [target.id]
              : [];
          }),
        );
        return { done, failures };
      },
      onDone: refresh,
    },
    {
      key: "detach",
      privileges: ["CompExec"],
      runAll: async (targets) => {
        const chosen: AttachmentRow[] = [];
        const failures: string[] = [];
        for (const target of targets) {
          const row = rows.get(target.id);
          if (row === undefined) continue;
          if (row.objectId === undefined)
            failures.push(failure(target.name, t("complianceAttachments.nothingAttached")));
          else chosen.push(row);
        }
        const outcomes = await applyPairs(
          "detach",
          chosen.flatMap((row) => (row.objectId === undefined ? [] : [pairOf(row, row.objectId)])),
        );
        const done: ActionTarget[] = [];
        outcomes.forEach((outcome, index) => {
          const row = chosen[index];
          if (row === undefined) return;
          if (outcome.status < 400)
            done.push({ id: attachmentRowId(row), name: attachmentRowName(row) });
          else failures.push(failure(attachmentRowName(row), outcome.info));
        });
        // The rows detached are gone from the list: unticked.
        onChanged(done.map((target) => target.id));
        return { done, failures };
      },
      onDone: refresh,
    },
  ];
}
