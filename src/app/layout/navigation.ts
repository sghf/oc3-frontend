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
    | "/compliance/modulesets"
    | "/compliance/rulesets"
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

export interface NavCategory {
  key: string;
  labelKey: string;
  entries: NavEntry[];
}

/** Entries outside any category, at the top of the menu. */
export const NAV_TOP: NavEntry[] = [
  { to: "/", labelKey: "nav.dashboard", icon: "dashboard", exact: true },
];

export const NAV_CATEGORIES: NavCategory[] = [
  {
    key: "infrastructure",
    labelKey: "nav.categories.infrastructure",
    entries: [
      { to: "/nodes", labelKey: "nav.nodes", icon: "node" },
      // Not in the historical menu: the clusters whose daemon pushes its status, next
      // to the nodes they group.
      { to: "/clusters", labelKey: "nav.clusters", icon: "cluster" },
      { to: "/services", labelKey: "nav.services", icon: "service" },
      { to: "/instances", labelKey: "nav.instances", icon: "instance" },
      // `view-resources` of the historical menu: the resources of every instance.
      { to: "/resources", labelKey: "nav.resources", icon: "resource" },
      // `view-actions` of the historical menu: the actions the agents ran.
      { to: "/service-actions", labelKey: "nav.serviceActions", icon: "action" },
      { to: "/networks", labelKey: "nav.networks", icon: "network" },
      { to: "/disks", labelKey: "nav.disks", icon: "disk" },
      // `view-san` of the historical menu: the ports of the SAN switches.
      { to: "/san-switches", labelKey: "nav.switches", icon: "switch" },
      // `view-nodes-hw` of the historical menu: the hardware components of every node.
      { to: "/hardware", labelKey: "nav.hardware", icon: "hardware" },
      // `view-pkg` of the historical menu: the packages installed on the nodes.
      { to: "/packages", labelKey: "nav.packages", icon: "package" },
    ],
  },
  {
    // Application codes go here rather than under Infrastructure: the historical menu
    // kept their creation in `dm-add-app`, and the view carries the list and the
    // creation together.
    key: "dataManagement",
    labelKey: "nav.categories.dataManagement",
    entries: [
      { to: "/apps", labelKey: "nav.apps", icon: "app" },
      { to: "/tags", labelKey: "nav.tags", icon: "tags" },
    ],
  },
  {
    // The Requests section of the historical menu, placed before Administration as
    // there: the request portal, and later the pending requests and their history.
    key: "requests",
    labelKey: "nav.categories.requests",
    entries: [
      // `req-new` of the historical Requests menu: the catalog of the forms to submit.
      // Exact: the prefix would also match the requests list below.
      { to: "/requests", labelKey: "nav.newRequest", icon: "form", exact: true },
      // `req-pending-my`: the pending requests awaiting the user's team.
      { to: "/requests/team", labelKey: "nav.teamRequests", icon: "form" },
      // `req-pending-tiers`: the team's pending requests awaiting someone else.
      { to: "/requests/tiers", labelKey: "nav.tiersRequests", icon: "form" },
      // `req-all` of the historical Requests menu: every request submitted.
      { to: "/requests/all", labelKey: "nav.allRequests", icon: "form" },
    ],
  },
  {
    // The Compliance section of the historical menu, placed between Requests and
    // Administration.
    key: "compliance",
    labelKey: "nav.categories.compliance",
    entries: [
      // `comp-modsets` of the historical menu.
      { to: "/compliance/modulesets", labelKey: "nav.modulesets", icon: "moduleset" },
      // `comp-rsets` of the historical menu.
      { to: "/compliance/rulesets", labelKey: "nav.rulesets", icon: "ruleset" },
      // `comp-designer` of the historical menu.
      {
        to: "/compliance/designer",
        labelKey: "nav.designer",
        icon: "designer",
        privileges: ["CompManager"],
      },
      // `comp-log` of the historical menu.
      { to: "/compliance/logs", labelKey: "nav.complianceLogs", icon: "complianceLog" },
    ],
  },
  {
    // The Statistics section of the historical menu, placed between Compliance and
    // Administration as there: what is read, apart from what is administered.
    key: "statistics",
    labelKey: "nav.categories.statistics",
    entries: [
      // `stat-reports` of the historical menu: the reports, rendered, to read.
      { to: "/stats/reports", labelKey: "nav.statReports", icon: "report" },
    ],
  },
  {
    // The historical menu places users under Administration (`adm-usr`).
    key: "administration",
    labelKey: "nav.categories.administration",
    entries: [
      { to: "/users", labelKey: "nav.users", icon: "user", privileges: ["UserManager"] },
      // Groups follow the users they gather. The historical menu kept them under Data
      // Management (`dm-add-group`); moved here on request.
      { to: "/groups", labelKey: "nav.groups", icon: "group", privileges: ["GroupManager"] },
      // `adm-obs` in the historical menu.
      {
        to: "/obsolescence",
        labelKey: "nav.obsolescence",
        icon: "obsolescence",
        privileges: ["ObsManager"],
      },
      // `adm-log`.
      { to: "/logs", labelKey: "nav.logs", icon: "log" },
      // `adm-filters`.
      // No privilege of their own in the collector: Manager.
      { to: "/filters", labelKey: "nav.filters", icon: "filter", privileges: ["Manager"] },
      // `adm-filtersets`.
      { to: "/filtersets", labelKey: "nav.filtersets", icon: "filterset", privileges: ["Manager"] },
      // `adm-forms`.
      { to: "/forms", labelKey: "nav.forms", icon: "form", privileges: ["FormsManager"] },
      // `adm-metrics`: the SQL requests feeding the charts and the reports.
      { to: "/metrics", labelKey: "nav.metrics", icon: "metric", privileges: ["ReportsManager"] },
      // `adm-charts`: the time series of historized metrics.
      { to: "/charts", labelKey: "nav.charts", icon: "chart", privileges: ["ReportsManager"] },
      // `adm-reports`: the definitions of the pages of charts and metrics, read in
      // Statistics.
      { to: "/reports", labelKey: "nav.reports", icon: "report", privileges: ["ReportsManager"] },
    ],
  },
];
