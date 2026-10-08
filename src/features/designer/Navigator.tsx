import { useContext, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import {
  CaretRightIcon,
  FilterIcon,
  GlobeIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  TargetIcon,
} from "@/components/ui/icons";
import { useDesigner } from "./designer-context";
import { useDraggable, useDropTarget, type DragItem } from "./drag";
import {
  isModified,
  parentsOf,
  type Moduleset,
  type ObjectKind,
  type Operation,
  type Ruleset,
} from "./model";
import { AddByName } from "./parts";
import { SelectContext, dropClasses, type Selection } from "./ui";
import {
  useComplianceGroups,
  useDesignerFiltersets,
  type DesignerFilterset,
  type DesignerGroup,
} from "./use-designer-data";

type QuickFilter = "modified" | "contextual" | "private" | "unused";

const QUICK_FILTERS: QuickFilter[] = ["modified", "contextual", "private", "unused"];

/**
 * The list of the modulesets, rulesets, filtersets and groups, in sections stacked
 * in one column, so that anything can be dragged onto anything: a ruleset onto a
 * moduleset or a ruleset, a moduleset onto a moduleset, a filterset or a variable
 * onto a ruleset, a group onto a ruleset or a moduleset. Filtered as one types,
 * and by quick filters.
 */
export function Navigator({
  selected,
  onVariableDrop,
}: {
  selected: Selection | null;
  /** A variable dropped on a ruleset: the page asks whether to copy or move it. */
  onVariableDrop: (
    operation: Extract<Operation, { op: "copyVariable" }>,
    at: { x: number; y: number },
  ) => void;
}) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<QuickFilter>>(new Set());
  const needle = query.trim().toLowerCase();
  // Collapsed by default, the sections open while a filter narrows them, so that
  // what matches shows, and fold back when it is cleared.
  const filtering = needle !== "" || filters.size > 0;

  const keep = (o: Ruleset | Moduleset) => {
    if (needle !== "" && !o.name.toLowerCase().includes(needle)) return false;
    const ref = { kind: o.kind, id: o.id };
    if (filters.has("modified") && !isModified(designer.original, designer.draft, ref))
      return false;
    if (filters.has("contextual") && !(o.kind === "ruleset" && o.type === "contextual"))
      return false;
    if (filters.has("private") && !(o.kind === "ruleset" && !o.isPublic)) return false;
    if (filters.has("unused")) {
      const parents = parentsOf(designer.draft, ref);
      if (parents.rulesets.length > 0 || parents.modulesets.length > 0) return false;
    }
    return true;
  };
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const modulesets = Object.values(designer.draft.modulesets).filter(keep).sort(byName);
  const rulesets = Object.values(designer.draft.rulesets).filter(keep).sort(byName);
  const allGroups = useComplianceGroups();
  const teamed = new Set(
    [
      ...Object.values(designer.draft.rulesets),
      ...Object.values(designer.draft.modulesets),
    ].flatMap((o) => [...o.responsibles, ...o.publications]),
  );
  // Groups are not changed by the draft either: the same quick filters leave none.
  const groups =
    filters.has("modified") || filters.has("contextual") || filters.has("private")
      ? []
      : (allGroups.data ?? []).filter(
          (g) =>
            (needle === "" || g.role.toLowerCase().includes(needle)) &&
            !(filters.has("unused") && teamed.has(g.role)),
        );
  const allFiltersets = useDesignerFiltersets();
  const usedFiltersets = new Set(Object.values(designer.draft.rulesets).map((r) => r.filterset));
  // Filtersets are not changed by the draft, nor contextual or private: those quick
  // filters leave none of them.
  const filtersets =
    filters.has("modified") || filters.has("contextual") || filters.has("private")
      ? []
      : (allFiltersets.data ?? []).filter(
          (f) =>
            (needle === "" || f.name.toLowerCase().includes(needle)) &&
            !(filters.has("unused") && usedFiltersets.has(f.name)),
        );

  return (
    <nav aria-label={t("designer.navigator")} className="flex min-h-0 flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 text-ink-muted" />
        <input
          type="search"
          aria-label={t("designer.filter")}
          placeholder={t("designer.filter")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="h-8 w-full rounded-(--radius-control) border border-line bg-surface pr-2 pl-7"
        />
      </div>
      <div className="flex items-center gap-1" role="group" aria-label={t("designer.quickFilters")}>
        <FilterIcon className="h-3.5 w-3.5 text-ink-muted" />
        {QUICK_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filters.has(f)}
            onClick={() => {
              const next = new Set(filters);
              if (next.has(f)) next.delete(f);
              else next.add(f);
              setFilters(next);
            }}
            // Data size and tight padding: the four fit on one row beside the icon,
            // in the width of the list (19rem, `DesignerPage`), French labels included.
            className="h-6 rounded-full border border-line px-1.5 text-data whitespace-nowrap text-ink-muted hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-ink"
          >
            {t(`designer.quick.${f}`)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <NavSection
          kind="moduleset"
          items={modulesets}
          filtering={filtering}
          selected={selected}
          onVariableDrop={onVariableDrop}
        />
        <NavSection
          kind="ruleset"
          items={rulesets}
          filtering={filtering}
          selected={selected}
          onVariableDrop={onVariableDrop}
        />
        <FiltersetSection items={filtersets} filtering={filtering} selected={selected} />
        <GroupSection items={groups} filtering={filtering} selected={selected} />
      </div>
    </nav>
  );
}

/**
 * Whether a section of the list is open: collapsed by default, opened when a
 * filter starts narrowing the list and collapsed again when it stops, the user's
 * own toggles holding in between.
 */
function useSectionOpen(filtering: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(filtering);
  const [wasFiltering, setWasFiltering] = useState(filtering);
  if (filtering !== wasFiltering) {
    // Adjusted while rendering, as React recommends over an effect.
    setWasFiltering(filtering);
    setOpen(filtering);
  }
  return [open, setOpen];
}

/** Moves the focus between the items of a list with the arrow keys. */
function moveFocus(event: KeyboardEvent<HTMLUListElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-nav-item]")];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = items[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (next !== undefined) {
    event.preventDefault();
    next.focus();
  }
}

function NavSection({
  kind,
  items,
  filtering,
  selected,
  onVariableDrop,
}: {
  kind: ObjectKind;
  items: (Ruleset | Moduleset)[];
  filtering: boolean;
  selected: Selection | null;
  onVariableDrop: (
    operation: Extract<Operation, { op: "copyVariable" }>,
    at: { x: number; y: number },
  ) => void;
}) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const select = useContext(SelectContext);
  const [open, setOpen] = useSectionOpen(filtering);
  const [adding, setAdding] = useState(false);
  const title = t(kind === "ruleset" ? "designer.rulesets" : "designer.modulesets");
  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center gap-1 bg-surface py-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
          className="flex items-center gap-1 font-semibold"
        >
          <CaretRightIcon className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          <ObjectIcon kind={kind} className="h-4 w-4" />
          {title}
          <span className="font-normal text-ink-muted">({items.length})</span>
        </button>
        <button
          type="button"
          aria-expanded={adding}
          title={t(`designer.new.${kind}`)}
          aria-label={t(`designer.new.${kind}`)}
          onClick={() => {
            setAdding(!adding);
            setOpen(true);
          }}
          className="ml-auto rounded-(--radius-control) p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {adding && (
        <div className="mb-2">
          <AddByName
            label={t("designer.create")}
            placeholder={t("designer.namePlaceholder")}
            fieldLabel={t(`designer.newName.${kind}`)}
            fill
            onAdd={(name) => {
              const { refused, created } = designer.run({ op: "create", kind, name });
              if (refused === null && created !== undefined) {
                setAdding(false);
                select(created);
                designer.notify({
                  key: `designer.log.create.${kind}`,
                  values: { name: name.trim() },
                  tone: "done",
                });
              }
              return refused;
            }}
          />
        </div>
      )}
      {open && (
        <ul className="space-y-0.5" onKeyDown={moveFocus}>
          {items.length === 0 && <li className="px-2 text-ink-muted">{t("designer.noMatch")}</li>}
          {items.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              selected={selected?.kind === item.kind && selected.id === item.id}
              onVariableDrop={onVariableDrop}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NavItem({
  item,
  selected,
  onVariableDrop,
}: {
  item: Ruleset | Moduleset;
  selected: boolean;
  onVariableDrop: (
    operation: Extract<Operation, { op: "copyVariable" }>,
    at: { x: number; y: number },
  ) => void;
}) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const select = useContext(SelectContext);
  const ref = { kind: item.kind, id: item.id };
  const drag = useDraggable({ type: item.kind, id: item.id }, item.name);
  const target = useDropTarget(
    (dragged: DragItem): Operation | null => {
      if (dragged.type === "ruleset" || dragged.type === "moduleset")
        return item.kind === "ruleset" && dragged.type === "moduleset"
          ? null
          : { op: "include", parent: ref, child: { kind: dragged.type, id: dragged.id } };
      // A group dropped on an object publishes it, as the historical designer does;
      // the Teams section of the editor gives the other role.
      if (dragged.type === "group")
        return { op: "addTeam", ref, role: "publications", team: dragged.role };
      if (dragged.type === "filterset" && item.kind === "ruleset")
        return { op: "setFilterset", id: item.id, filterset: dragged.name };
      if (dragged.type === "variable" && item.kind === "ruleset")
        return {
          op: "copyVariable",
          fromId: dragged.rulesetId,
          variableId: dragged.variableId,
          toId: item.id,
          move: false,
        };
      return null;
    },
    (operation, _dragged, at) => {
      if (operation.op === "copyVariable") onVariableDrop(operation, at);
      else designer.runAndTell(operation);
    },
  );
  const modified = isModified(designer.original, designer.draft, ref);
  const count =
    item.kind === "ruleset"
      ? t("designer.count.variables", { count: item.variables.length })
      : t("designer.count.modules", { count: item.modules.length });
  return (
    <li
      {...target.props}
      className={`rounded-(--radius-control) outline-offset-[-1px] ${dropClasses(target)}`}
    >
      <button
        type="button"
        data-nav-item
        {...drag}
        aria-current={selected ? "true" : undefined}
        onClick={() => {
          select(ref);
        }}
        className={`flex w-full cursor-pointer items-center gap-1.5 rounded-(--radius-control) px-2 py-1 text-left ${
          selected ? "bg-accent-soft text-ink" : "hover:bg-surface-sunken"
        }`}
      >
        <ObjectIcon kind={item.kind} className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{item.name}</span>
        {item.kind === "ruleset" &&
          (item.type === "contextual" ? (
            // The funnel of the filterset that selects its nodes; in the warning tint
            // when there is none, since it then selects no node.
            <span
              className="shrink-0"
              title={t("designer.contextualTitle", {
                filterset: item.filterset ?? t("designer.noFilterset"),
              })}
            >
              <FilterIcon
                className={`h-3 w-3 ${item.filterset === null ? "text-state-warn" : "text-ink-muted"}`}
                aria-label={t("designer.types.contextual")}
              />
            </span>
          ) : (
            <span className="shrink-0" title={t("designer.types.explicit")}>
              <TargetIcon
                className="h-3 w-3 text-ink-muted"
                aria-label={t("designer.types.explicit")}
              />
            </span>
          ))}
        {item.kind === "ruleset" &&
          (item.isPublic ? (
            <GlobeIcon
              className="h-3 w-3 shrink-0 text-ink-muted"
              aria-label={t("designer.public")}
            />
          ) : (
            <LockIcon
              className="h-3 w-3 shrink-0 text-ink-muted"
              aria-label={t("designer.private")}
            />
          ))}
        <span className="ml-auto shrink-0 text-ink-muted">{count}</span>
        {modified && (
          <span
            className="shrink-0 text-state-warn"
            title={t("designer.modified")}
            aria-label={t("designer.modified")}
          >
            ●
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * The filtersets, read only: dragged onto a ruleset, one becomes its filterset,
 * which makes it contextual. Each tells how many rulesets of the draft use it.
 */
function FiltersetSection({
  items,
  filtering,
  selected,
}: {
  items: DesignerFilterset[];
  filtering: boolean;
  selected: Selection | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useSectionOpen(filtering);
  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center gap-1 bg-surface py-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
          className="flex items-center gap-1 font-semibold"
        >
          <CaretRightIcon className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          <ObjectIcon kind="filterset" className="h-4 w-4" />
          {t("designer.filtersets")}
          <span className="font-normal text-ink-muted">({items.length})</span>
        </button>
      </div>
      {open && (
        <ul className="space-y-0.5" onKeyDown={moveFocus}>
          {items.length === 0 && <li className="px-2 text-ink-muted">{t("designer.noMatch")}</li>}
          {items.map((item) => (
            <FiltersetItem
              key={item.id}
              item={item}
              selected={selected?.kind === "filterset" && selected.id === item.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FiltersetItem({ item, selected }: { item: DesignerFilterset; selected: boolean }) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const select = useContext(SelectContext);
  const drag = useDraggable({ type: "filterset", id: item.id, name: item.name }, item.name);
  const users = Object.values(designer.draft.rulesets).filter(
    (r) => r.filterset === item.name,
  ).length;
  return (
    <li>
      <button
        type="button"
        data-nav-item
        {...drag}
        aria-current={selected ? "true" : undefined}
        title={t("designer.filtersetDragHint")}
        onClick={() => {
          select({ kind: "filterset", id: item.id });
        }}
        className={`flex w-full cursor-pointer items-center gap-1.5 rounded-(--radius-control) px-2 py-1 text-left ${
          selected ? "bg-accent-soft text-ink" : "hover:bg-surface-sunken"
        }`}
      >
        <ObjectIcon kind="filterset" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{item.name}</span>
        <span className="ml-auto shrink-0 text-ink-muted">
          {users === 0 ? t("designer.unusedShort") : t("designer.count.rulesets", { count: users })}
        </span>
      </button>
    </li>
  );
}

/**
 * The groups, read only: dragged onto a ruleset or a moduleset, one is published
 * to; dropped on a list of the Teams section, it takes that role. Each tells how
 * many objects of the draft name it.
 */
function GroupSection({
  items,
  filtering,
  selected,
}: {
  items: DesignerGroup[];
  filtering: boolean;
  selected: Selection | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useSectionOpen(filtering);
  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center gap-1 bg-surface py-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
          className="flex items-center gap-1 font-semibold"
        >
          <CaretRightIcon className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          <ObjectIcon kind="group" className="h-4 w-4" />
          {t("designer.groups")}
          <span className="font-normal text-ink-muted">({items.length})</span>
        </button>
      </div>
      {open && (
        <ul className="space-y-0.5" onKeyDown={moveFocus}>
          {items.length === 0 && <li className="px-2 text-ink-muted">{t("designer.noMatch")}</li>}
          {items.map((item) => (
            <GroupItem
              key={item.id}
              item={item}
              selected={selected?.kind === "group" && selected.id === item.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GroupItem({ item, selected }: { item: DesignerGroup; selected: boolean }) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const select = useContext(SelectContext);
  const drag = useDraggable({ type: "group", id: item.id, role: item.role }, item.role);
  const uses = [
    ...Object.values(designer.draft.rulesets),
    ...Object.values(designer.draft.modulesets),
  ].filter((o) => o.responsibles.includes(item.role) || o.publications.includes(item.role)).length;
  return (
    <li>
      <button
        type="button"
        data-nav-item
        {...drag}
        aria-current={selected ? "true" : undefined}
        title={t("designer.groupDragHint")}
        onClick={() => {
          select({ kind: "group", id: item.id });
        }}
        className={`flex w-full cursor-pointer items-center gap-1.5 rounded-(--radius-control) px-2 py-1 text-left ${
          selected ? "bg-accent-soft text-ink" : "hover:bg-surface-sunken"
        }`}
      >
        <ObjectIcon kind="group" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{item.role}</span>
        <span className="ml-auto shrink-0 text-ink-muted">
          {uses === 0 ? t("designer.unusedShort") : t("designer.count.objects", { count: uses })}
        </span>
      </button>
    </li>
  );
}
