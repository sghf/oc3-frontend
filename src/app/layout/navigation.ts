/**
 * Menu structure, as data rather than JSX: adding a view or a section is done here,
 * and folding by section will be able to rely on the category key without touching
 * the rendering.
 *
 * The sections mirror those of the historical collector menu, listed in MIGRATION.md
 * §4.4. Only sections with at least one ported view are declared: an empty section
 * would promise views that do not exist yet.
 */
import type { ObjectKind } from "@/components/opensvc/ObjectIcon";

export interface NavEntry {
  to:
    | "/"
    | "/nodes"
    | "/clusters"
    | "/hardware"
    | "/services"
    | "/instances"
    | "/resources"
    | "/service-actions"
    | "/networks"
    | "/disks"
    | "/san-switches"
    | "/packages"
    | "/apps"
    | "/groups"
    | "/tags"
    | "/users"
    | "/obsolescence"
    | "/logs"
    | "/filters"
    | "/claim-mappings"
    | "/metrics"
    | "/reports"
    | "/stats/reports"
    | "/charts"
    | "/filtersets"
    | "/forms"
    | "/requests"
    | "/requests/all"
    | "/requests/team"
    | "/requests/tiers"
    | "/safe"
    | "/compliance/modulesets"
    | "/compliance/rulesets"
    | "/compliance/status"
    | "/compliance/logs"
    | "/compliance/designer";
  labelKey: string;
  icon: ObjectKind;
  /** True for the root: without it, prefix matching would activate it everywhere. */
  exact?: boolean;
  /**
   * The privileges one of which the entry needs to be shown; a Manager holds them
   * all. Absent, everybody sees it. The menu only: the API serves the view to
   * whoever opens its address, its actions checking their own privilege.
   */
  privileges?: readonly string[];
}

/**
 * The two menus the side menu switches between: "operator", to watch the estate
 * and act on it day to day, and "admin", to set up how the collector works. Each
 * section belongs to one of them, so does each page.
 */
export type NavView = "operator" | "admin";

export const NAV_VIEWS: readonly NavView[] = ["operator", "admin"];

export interface NavCategory {
  key: string;
  labelKey: string;
  view: NavView;
  entries: NavEntry[];
}

/** Entries outside any category, at the top of the operator menu. */
export const NAV_TOP: NavEntry[] = [
  { to: "/", labelKey: "nav.dashboard", icon: "dashboardView", exact: true },
];

/**
 * The sections of both menus. The operator sections keep the keys of the former
 * single menu, so that the sections a user folded stay folded.
 */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    key: "infrastructure",
    labelKey: "nav.categories.infrastructure",
    view: "operator",
    entries: [
      { to: "/nodes", labelKey: "nav.nodes", icon: "node" },
      { to: "/clusters", labelKey: "nav.clusters", icon: "cluster" },
      { to: "/services", labelKey: "nav.services", icon: "service" },
      { to: "/instances", labelKey: "nav.instances", icon: "instance" },
      { to: "/resources", labelKey: "nav.resources", icon: "resource" },
      { to: "/service-actions", labelKey: "nav.serviceActions", icon: "action" },
    ],
  },
  {
    key: "inventory",
    labelKey: "nav.categories.inventory",
    view: "operator",
    entries: [
      { to: "/networks", labelKey: "nav.networks", icon: "network" },
      { to: "/disks", labelKey: "nav.disks", icon: "disk" },
      { to: "/san-switches", labelKey: "nav.switches", icon: "switch" },
      { to: "/hardware", labelKey: "nav.hardware", icon: "hardware" },
      { to: "/packages", labelKey: "nav.packages", icon: "package" },
    ],
  },
  {
    key: "compliance",
    labelKey: "nav.categories.compliance",
    view: "operator",
    entries: [
      { to: "/compliance/status", labelKey: "nav.complianceStatus", icon: "complianceStatus" },
      { to: "/compliance/logs", labelKey: "nav.complianceLogs", icon: "complianceLog" },
    ],
  },
  {
    key: "requests",
    labelKey: "nav.categories.requests",
    view: "operator",
    entries: [
      { to: "/requests", labelKey: "nav.newRequest", icon: "form", exact: true },
      { to: "/requests/team", labelKey: "nav.teamRequests", icon: "form" },
      { to: "/requests/tiers", labelKey: "nav.tiersRequests", icon: "form" },
      { to: "/requests/all", labelKey: "nav.allRequests", icon: "form" },
    ],
  },
  {
    key: "statistics",
    labelKey: "nav.categories.statistics",
    view: "operator",
    entries: [{ to: "/stats/reports", labelKey: "nav.statReports", icon: "report" }],
  },
  {
    key: "access",
    labelKey: "nav.categories.access",
    view: "admin",
    entries: [
      { to: "/users", labelKey: "nav.users", icon: "user", privileges: ["UserManager"] },
      { to: "/groups", labelKey: "nav.groups", icon: "group", privileges: ["GroupManager"] },
      {
        to: "/claim-mappings",
        labelKey: "nav.claimMappings",
        icon: "claimMapping",
        privileges: ["Manager"],
      },
    ],
  },
  {
    key: "inventoryData",
    labelKey: "nav.categories.inventoryData",
    view: "admin",
    entries: [
      { to: "/apps", labelKey: "nav.apps", icon: "app" },
      { to: "/tags", labelKey: "nav.tags", icon: "tags" },
      {
        to: "/obsolescence",
        labelKey: "nav.obsolescence",
        icon: "obsolescence",
        privileges: ["ObsManager"],
      },
    ],
  },
  {
    key: "complianceDesign",
    labelKey: "nav.categories.compliance",
    view: "admin",
    entries: [
      { to: "/compliance/modulesets", labelKey: "nav.modulesets", icon: "moduleset" },
      { to: "/compliance/rulesets", labelKey: "nav.rulesets", icon: "ruleset" },
      {
        to: "/compliance/designer",
        labelKey: "nav.designer",
        icon: "designer",
        privileges: ["CompManager"],
      },
      // Everyone: the files published to one's teams, which the rulesets and the
      // service configurations reference (safe://).
      { to: "/safe", labelKey: "nav.safe", icon: "safe" },
    ],
  },
  {
    key: "requestForms",
    labelKey: "nav.categories.requests",
    view: "admin",
    entries: [{ to: "/forms", labelKey: "nav.forms", icon: "form", privileges: ["FormsManager"] }],
  },
  {
    key: "reporting",
    labelKey: "nav.categories.reporting",
    view: "admin",
    entries: [
      { to: "/metrics", labelKey: "nav.metrics", icon: "metric", privileges: ["ReportsManager"] },
      { to: "/charts", labelKey: "nav.charts", icon: "chart", privileges: ["ReportsManager"] },
      { to: "/reports", labelKey: "nav.reports", icon: "report", privileges: ["ReportsManager"] },
    ],
  },
  {
    key: "filtering",
    labelKey: "nav.categories.filtering",
    view: "admin",
    entries: [
      { to: "/filters", labelKey: "nav.filters", icon: "filter", privileges: ["Manager"] },
      { to: "/filtersets", labelKey: "nav.filtersets", icon: "filterset", privileges: ["Manager"] },
    ],
  },
  {
    key: "audit",
    labelKey: "nav.categories.audit",
    view: "admin",
    entries: [{ to: "/logs", labelKey: "nav.logs", icon: "log" }],
  },
];

/**
 * The menu a page belongs to: that of the entry its path starts with, the longest
 * one winning (`/stats/reports/12` is Statistics' Reports, `/reports` Report
 * definitions). Null for a page of no menu, such as the profile or the action
 * queue: the side menu then stays as it is.
 */
export function viewOfPath(pathname: string): NavView | null {
  if (pathname === "/") return "operator";
  let best: { length: number; view: NavView } | null = null;
  for (const category of NAV_CATEGORIES) {
    for (const entry of category.entries) {
      const hit = pathname === entry.to || pathname.startsWith(`${entry.to}/`);
      if (hit && (best === null || entry.to.length > best.length))
        best = { length: entry.to.length, view: category.view };
    }
  }
  return best?.view ?? null;
}
