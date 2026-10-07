import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClockIcon, CloseIcon, HistoryIcon, ShapesIcon, TrashIcon } from "@/components/ui/icons";
import { usePanelSide } from "@/components/ui/panel-side";
import { formatRelativeInstant } from "@/lib/format";
import { useHistoryGrouping, type HistoryGrouping } from "@/lib/user-prefs";
import { ObjectIcon, type ObjectKind } from "./ObjectIcon";
import { moveHistoryEntries } from "./history-motion";
import { usePanelHistory, type HistoryEntry, type HistoryGroup } from "./panel-history";

const RAIL_BUTTON =
  "flex h-7 items-center justify-center rounded-(--radius-control) text-ink-muted hover:bg-surface-raised hover:text-ink";

/** The heading of a kind of record: the name of its list in the menu. */
const KIND_LABEL: Partial<Record<ObjectKind, string>> = {
  node: "nav.nodes",
  cluster: "nav.clusters",
  service: "nav.services",
  instance: "nav.instances",
  network: "nav.networks",
  disk: "nav.disks",
  app: "nav.apps",
  tag: "nav.tags",
  moduleset: "nav.modulesets",
  ruleset: "nav.rulesets",
  user: "nav.users",
  group: "nav.groups",
  filterset: "nav.filtersets",
  form: "nav.forms",
  metric: "nav.metrics",
  chart: "nav.charts",
  report: "nav.reports",
};

/** As tall as the header of the panel it stands against, so that the two lines meet. */
const RAIL_HEADER = "flex h-11 shrink-0 items-center gap-1 border-b border-line pr-1 pl-2";

/**
 * The panel history as the right zone of the detail panel (`rail` of `SlideOver`),
 * over its whole height, on a sunken background that sets it apart from the
 * record. Against the edge of the window, its pills do not move when the record
 * zone changes width from one kind of record to the next: one pill per record shown during the last week,
 * with the icon of its kind and its name on one line, as the badges that name an
 * object elsewhere. The pills are grouped by how long ago their record was shown —
 * now, the last hour, the last day, the last week — the most recent first, and a
 * group without a record is not shown; the groups are worked out again as time
 * passes. The switch of the header groups them by kind instead, in the order of
 * the menu, each record's age then in its tooltip; the choice follows the account. The record on display is highlighted where it stands, and scrolled into
 * view.
 *
 * Clicking a pill shows its record and leaves it where it stands; shown from
 * anywhere else, a record comes back on top, the others sliding down
 * (`history-motion.ts`). The cross at the right end of a pill, shown when the
 * entry is hovered or focused, removes it; the bin in the header clears them all.
 * The list scrolls when the entries do not all fit. Nothing is rendered while the
 * history is empty.
 */
export function PanelHistoryRail({ currentKey }: { currentKey: string }) {
  const { t } = useTranslation();
  const grouping = useHistoryGrouping();
  const history = usePanelHistory(currentKey, grouping.value);
  const { side } = usePanelSide();
  const list = useRef<HTMLDivElement>(null);
  const signature = history.entries.map((entry) => entry.key).join(",");

  useLayoutEffect(() => {
    if (list.current !== null) moveHistoryEntries(list.current, signature);
  }, [signature]);

  // The record on display stays in sight, however far down the list it stands.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>("[aria-current]")
      ?.scrollIntoView({ block: "nearest" });
  }, [currentKey, signature]);

  if (history.entries.length === 0) return null;

  return (
    <nav
      aria-label={t("panelHistory.label")}
      // Sunken, against the raised record zone: two zones of one panel.
      // The border faces the record, whichever edge of the window the panel stands on.
      className={`flex h-full w-44 flex-col border-line-strong bg-surface-sunken ${
        side === "left" ? "border-r" : "border-l"
      }`}
    >
      <div className={RAIL_HEADER}>
        <HistoryIcon className="h-4 w-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate text-ink-muted">{t("panelHistory.title")}</span>
        <GroupingSwitch value={grouping.value} onChange={grouping.set} />
        <button
          type="button"
          title={t("panelHistory.clear")}
          onClick={history.clear}
          className={`${RAIL_BUTTON} w-7 shrink-0`}
        >
          <TrashIcon className="h-3.5 w-3.5" />
          <span className="sr-only">{t("panelHistory.clear")}</span>
        </button>
      </div>
      {/* Positioned: the entries measure their place from it (`history-motion.ts`). */}
      <div ref={list} className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {history.groups.map((group) => (
          <section key={group.key} aria-labelledby={`history-${group.key}`}>
            <GroupHeading
              group={group}
              id={`history-${group.key}`}
              className="mb-1 flex items-center gap-1 text-[0.6875rem] font-medium tracking-wide text-ink-muted uppercase"
            />
            <ol className="flex flex-col gap-1">
              {group.entries.map((entry) => (
                <li
                  key={entry.key}
                  data-entry={entry.key}
                  // The pill: the record on the left, the cross that removes it on the right.
                  className={`group flex items-center rounded-full border text-data ${
                    entry.current
                      ? "border-accent bg-accent-soft font-medium text-ink"
                      : "border-line bg-surface-raised hover:border-line-strong hover:bg-surface"
                  }`}
                >
                  <EntryButton
                    entry={entry}
                    shownAt={group.by === "kind" ? entry.at : undefined}
                    onOpen={() => {
                      history.open(entry);
                    }}
                    iconClassName="h-3.5 w-3.5 shrink-0"
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-l-full py-0.5 pl-1.5 text-left"
                  />
                  <button
                    type="button"
                    title={t("panelHistory.remove", { name: entry.label })}
                    onClick={() => {
                      history.remove(entry);
                    }}
                    // Invisible at rest but present and focusable, for the keyboard.
                    className="mr-0.5 shrink-0 rounded-full p-0.5 text-ink-muted opacity-0 group-hover:opacity-100 hover:bg-surface-raised hover:text-ink focus-visible:opacity-100"
                  >
                    <CloseIcon className="h-3 w-3" />
                    <span className="sr-only">
                      {t("panelHistory.remove", { name: entry.label })}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </nav>
  );
}

/**
 * The panel history as a button of the header opening a list, where the window
 * leaves no room for the rail beside the panel. Same entries, same groups and same
 * actions.
 */
export function PanelHistoryMenu({ currentKey }: { currentKey: string }) {
  const { t } = useTranslation();
  const grouping = useHistoryGrouping();
  const history = usePanelHistory(currentKey, grouping.value);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && root.current?.contains(event.target) === false)
        setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (history.entries.length === 0) return null;
  const label = t("panelHistory.menu", { count: history.entries.length });

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        // The panel listens for Escape at the document level: without this, closing
        // the list would close the panel too.
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        title={label}
        onClick={() => {
          setOpen((previous) => !previous);
        }}
        className="flex h-7 items-center gap-1 rounded-(--radius-control) border border-line px-1.5 text-ink-muted hover:text-ink"
      >
        <HistoryIcon className="h-4 w-4" />
        <span aria-hidden="true" className="text-data tabular-nums">
          {history.entries.length}
        </span>
        <span className="sr-only">{label}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 w-64 rounded-(--radius-panel) border border-line bg-surface-raised p-1 shadow-lg">
          <div className="flex items-center justify-end px-1 pb-1">
            <GroupingSwitch value={grouping.value} onChange={grouping.set} />
          </div>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {history.groups.map((group) => (
              <section key={group.key} aria-labelledby={`history-menu-${group.key}`}>
                <GroupHeading
                  group={group}
                  id={`history-menu-${group.key}`}
                  className="flex items-center gap-1 px-2 pt-1 text-[0.6875rem] font-medium tracking-wide text-ink-muted uppercase"
                />
                <ol className="flex flex-col">
                  {group.entries.map((entry) => (
                    <li key={entry.key} className="flex items-center gap-1">
                      <EntryButton
                        entry={entry}
                        shownAt={group.by === "kind" ? entry.at : undefined}
                        onOpen={() => {
                          setOpen(false);
                          history.open(entry);
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-(--radius-control) px-2 py-1 text-left ${
                          entry.current ? "bg-accent-soft font-medium" : "hover:bg-surface-sunken"
                        }`}
                      />
                      <button
                        type="button"
                        title={t("panelHistory.remove", { name: entry.label })}
                        onClick={() => {
                          history.remove(entry);
                        }}
                        className="shrink-0 rounded-full p-1 text-ink-muted hover:text-ink"
                      >
                        <CloseIcon className="h-3 w-3" />
                        <span className="sr-only">
                          {t("panelHistory.remove", { name: entry.label })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              history.clear();
            }}
            className="mt-1 flex w-full items-center gap-2 border-t border-line px-2 py-1 text-ink-muted hover:text-ink"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {t("panelHistory.clear")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The switch between the two groupings of the history: by time, by kind. Two
 * pressed-or-not buttons, an icon each, named by their tooltip.
 */
function GroupingSwitch({
  value,
  onChange,
}: {
  value: HistoryGrouping;
  onChange: (next: HistoryGrouping) => void;
}) {
  const { t } = useTranslation();
  const options: [HistoryGrouping, typeof ClockIcon][] = [
    ["time", ClockIcon],
    ["kind", ShapesIcon],
  ];
  return (
    <div
      role="group"
      aria-label={t("panelHistory.grouping.label")}
      className="flex shrink-0 rounded-(--radius-control) border border-line"
    >
      {options.map(([option, Icon]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          title={t(`panelHistory.grouping.${option}`)}
          onClick={() => {
            onChange(option);
          }}
          className="flex h-6 w-6 items-center justify-center text-ink-muted first:rounded-l-(--radius-control) last:rounded-r-(--radius-control) hover:text-ink aria-pressed:bg-accent-soft aria-pressed:text-ink"
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="sr-only">{t(`panelHistory.grouping.${option}`)}</span>
        </button>
      ))}
    </div>
  );
}

/** The heading of a group: its period, or its kind with its icon and count. */
function GroupHeading({
  group,
  id,
  className,
}: {
  group: HistoryGroup;
  id: string;
  className: string;
}) {
  const { t } = useTranslation();
  if (group.by === "time")
    return (
      <h3 id={id} className={className}>
        {t(`panelHistory.sections.${group.section}`)}
      </h3>
    );
  const label = KIND_LABEL[group.kind];
  return (
    <h3 id={id} className={className}>
      <ObjectIcon kind={group.kind} className="h-3 w-3" />
      <span className="min-w-0 truncate">{label === undefined ? group.kind : t(label)}</span>
      <span className="tabular-nums">{group.entries.length}</span>
    </h3>
  );
}

/**
 * An entry: the icon of its kind and its name; the one on display is not a link.
 * With `shownAt`, the tooltip also says when the record was shown, which the
 * grouping by kind no longer tells.
 */
function EntryButton({
  entry,
  shownAt,
  onOpen,
  className,
  iconClassName = "h-4 w-4",
}: {
  entry: HistoryEntry;
  shownAt?: number;
  onOpen: () => void;
  className: string;
  iconClassName?: string;
}) {
  const { t, i18n } = useTranslation();
  const when = shownAt === undefined ? undefined : formatRelativeInstant(shownAt, i18n.language);
  const content = (
    <>
      <ObjectIcon kind={entry.step.kind} className={iconClassName} />
      <span className="w-full min-w-0 truncate">{entry.label}</span>
    </>
  );
  // The record on display: said so, and nothing to open.
  if (entry.current)
    return (
      <span
        aria-current="true"
        title={
          when === undefined ? entry.label : t("panelHistory.shownAt", { name: entry.label, when })
        }
        className={className}
      >
        {content}
      </span>
    );
  return (
    <button
      type="button"
      title={
        when === undefined
          ? t("panelHistory.show", { name: entry.label })
          : `${t("panelHistory.show", { name: entry.label })} · ${t("panelHistory.shownWhen", { when })}`
      }
      onClick={onOpen}
      className={className}
    >
      {content}
    </button>
  );
}
