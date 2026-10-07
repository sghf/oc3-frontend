import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { CrossLink } from "./CrossLink";
import { ObjectIcon, type ObjectKind } from "./ObjectIcon";
import type { FiltersetUsage } from "./filterset-usage";

type UsingRef = components["schemas"]["FiltersetUsingRef"];

interface UsageGroup {
  key: string;
  icon: ObjectKind;
  items: ReactNode[];
}

/**
 * Uses grouped by kind: each group its label and count, its objects as badges
 * opening their record when they have one, and, when `consequences` is set, what
 * deleting the object used does to them.
 */
function UsageGroups({
  groups,
  consequences,
  prefix,
}: {
  groups: UsageGroup[];
  consequences: boolean;
  prefix: string;
}) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-2">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <li key={group.key} className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 font-medium">
              <ObjectIcon kind={group.icon} className="h-3.5 w-3.5" />
              {t(`${prefix}.${group.key}`, { count: group.items.length })}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-data">{group.items}</span>
            {consequences && (
              <span className="text-ink-muted">{t(`usage.consequences.${group.key}`)}</span>
            )}
          </li>
        ))}
    </ul>
  );
}

/**
 * Frame of the uses listed in the confirmation of a deletion: tinted as a warning,
 * its mark repeating it for those who do not tell the colours apart.
 */
export function UsageWarning({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-(--radius-panel) border border-state-warn bg-state-warn-soft p-2 whitespace-normal"
    >
      <p className="font-medium">
        <span className="text-state-warn">▲</span> {title}
      </p>
      {children}
    </div>
  );
}

/** A filterset holding the object looked up; marked when it would be left empty. */
function UsingFilterset({ entry, emptied }: { entry: UsingRef; emptied: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1">
      <CrossLink kind="filterset" id={String(entry.id)}>
        {entry.fset_name}
      </CrossLink>
      {emptied && entry.entries <= 1 && (
        <span className="font-medium text-state-warn">▲ {t("usage.emptied")}</span>
      )}
    </span>
  );
}

/**
 * Where a filterset is used: the filtersets nesting it, the rulesets it restricts,
 * the check thresholds, session filters, statistics comparisons and sysreport
 * grants set on it. With `consequences`, what deleting it does to
 * each, for the confirmation of the deletion.
 */
export function FiltersetUsageList({
  usage,
  consequences = false,
}: {
  usage: FiltersetUsage;
  consequences?: boolean;
}) {
  const groups: UsageGroup[] = [
    {
      key: "filtersets",
      icon: "filterset",
      items: usage.filtersets.map((entry) => (
        <UsingFilterset key={entry.id} entry={entry} emptied={consequences} />
      )),
    },
    {
      key: "rulesets",
      icon: "ruleset",
      items: usage.rulesets.map((ref) => (
        <CrossLink key={ref.id} kind="ruleset" id={String(ref.id)}>
          {ref.ruleset_name}
        </CrossLink>
      )),
    },
    {
      key: "users",
      icon: "user",
      items: usage.users.map((ref) => (
        <CrossLink key={ref.id} kind="user" id={String(ref.id)}>
          {ref.name === "" ? ref.email : ref.name}
        </CrossLink>
      )),
    },
    {
      key: "sysreportGrants",
      icon: "log",
      items: usage.sysreport_grants.map((grant) => (
        <span key={grant.id}>
          {grant.role} <code>{grant.pattern}</code>
        </span>
      )),
    },
    {
      key: "thresholds",
      icon: "metric",
      items: usage.thresholds.map((threshold) => <code key={threshold}>{threshold}</code>),
    },
    {
      key: "comparisons",
      icon: "chart",
      items: usage.comparisons.map((ref) => <span key={ref.id}>{ref.name}</span>),
    },
  ];
  return <UsageGroups groups={groups} consequences={consequences} prefix="usage.filterset" />;
}

/**
 * The filtersets holding a filter. With `consequences`, what deleting the filter
 * does to them: they lose that entry, and one left with none selects nothing.
 */
export function FilterUsageList({
  filtersets,
  consequences = false,
}: {
  filtersets: UsingRef[];
  consequences?: boolean;
}) {
  const groups: UsageGroup[] = [
    {
      key: "filterFiltersets",
      icon: "filterset",
      items: filtersets.map((entry) => (
        <UsingFilterset key={entry.id} entry={entry} emptied={consequences} />
      )),
    },
  ];
  return <UsageGroups groups={groups} consequences={consequences} prefix="usage.filter" />;
}
