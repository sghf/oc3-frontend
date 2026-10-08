import type { TFunction } from "i18next";
import type { components } from "@/lib/api/schema";
import type { ObjectKind } from "@/components/opensvc/ObjectIcon";
import { statusBadge } from "@/components/opensvc/status";
import type { ObjectState } from "@/components/opensvc/StatusBadge";
import { toInstanceId } from "@/features/instances/instance-id";
import { formatDate, formatSizeMiB } from "@/lib/format";
import { filterKey } from "@/lib/column-filters";

export type SearchKind = components["schemas"]["SearchGroup"]["kind"];
type Item = components["schemas"]["SearchGroup"]["items"][number];

/**
 * The kinds of the global search, in the order the server returns their groups
 * (`GET /search`). The palette offers them as scopes in the same order.
 */
export const SEARCH_KINDS: readonly SearchKind[] = [
  "node",
  "service",
  "instance",
  "app",
  "network",
  "disk",
  "tag",
  "user",
  "group",
  "privilege",
  "request",
  "moduleset",
  "ruleset",
  "filterset",
  "form",
];

/** Icon of each kind, in the vocabulary of the menu and the panels. */
export const KIND_ICON: Record<SearchKind, ObjectKind> = {
  node: "node",
  service: "service",
  instance: "instance",
  app: "app",
  network: "network",
  disk: "disk",
  tag: "tag",
  user: "user",
  group: "group",
  privilege: "privilege",
  // The requests are form submissions: the menu gives them the form mark.
  request: "form",
  moduleset: "moduleset",
  ruleset: "ruleset",
  filterset: "filterset",
  form: "form",
};

/**
 * The prefix restricting the search to a kind, `node:dev`, as in the historical
 * collector (`init/static/js/osvc/search/search.js`), whose prefixes are kept.
 * Instances, requests and privilege groups, which it did not search apart, get
 * their own. A scope badge writes this one.
 */
export const KIND_PREFIX: Record<SearchKind, string> = {
  node: "node",
  service: "svc",
  instance: "inst",
  app: "app",
  network: "ip",
  disk: "disk",
  tag: "tag",
  user: "user",
  group: "group",
  privilege: "priv",
  request: "req",
  moduleset: "modset",
  ruleset: "rset",
  filterset: "fset",
  form: "form",
};

/** Every prefix understood: those above, and the full names of the kinds. */
const PREFIX_KIND = new Map<string, SearchKind>([
  ...SEARCH_KINDS.map((kind): [string, SearchKind] => [KIND_PREFIX[kind], kind]),
  ...SEARCH_KINDS.map((kind): [string, SearchKind] => [kind, kind]),
]);

const PREFIX = /^\s*(\w+):\s*/;

/**
 * The text typed, split into the kind its prefix names and the text to search:
 * `svc: web` searches "web" among the services. A word that names no kind is
 * part of the text, so that `fe80:` or `http:` are searched as they are.
 */
export function parseSearchInput(input: string): { kind: SearchKind | undefined; text: string } {
  const match = PREFIX.exec(input);
  const kind = match?.[1] === undefined ? undefined : PREFIX_KIND.get(match[1].toLowerCase());
  if (match === null || kind === undefined) return { kind: undefined, text: input };
  return { kind, text: input.slice(match[0].length) };
}

/** The text with the prefix of `kind` in place of its own, or with none. */
export function withKindPrefix(input: string, kind: SearchKind | undefined): string {
  const { text } = parseSearchInput(input);
  return kind === undefined ? text : `${KIND_PREFIX[kind]}:${text}`;
}

/** The list routes a result or a "show in list" link can lead to. */
type ListRoute =
  | "/nodes"
  | "/services"
  | "/instances"
  | "/networks"
  | "/requests/all"
  | "/compliance/modulesets"
  | "/compliance/rulesets"
  | "/forms";

/** A list view filtered on one column: `/nodes?f.nodename=dev`. */
export interface ListTarget {
  to: ListRoute;
  search: Record<`f.${string}`, string>;
}

/**
 * How a result opens: in the record panel over the current view (`PeekPanel`),
 * the way a badge does, or — for a kind without a record panel — in its list,
 * filtered on the object.
 */
export type SearchTarget = { peek: { kind: string; id: string } } | { list: ListTarget };

/** One result of the search, ready to be shown and opened. */
export interface SearchHit {
  /** Unique across the whole result: the kind and the object's id. */
  key: string;
  kind: SearchKind;
  label: string;
  /**
   * Facts that tell apart objects of the same name: application, environment,
   * node, cluster… Empty ones are left out.
   */
  context: string[];
  /** The object's id, shortened when it is a UUID, for homonyms. */
  ref: string | undefined;
  state?: { state: ObjectState; label?: string };
  target: SearchTarget;
}

function text(item: Item, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

/** A UUID is shortened to its first group: enough to tell two homonyms apart. */
function shortRef(id: string): string | undefined {
  if (id === "") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) : id;
}

function facts(...values: string[]): string[] {
  return values.filter((value) => value !== "");
}

function list(to: ListRoute, prop: string, expr: string): SearchTarget {
  return { list: { to, search: { [filterKey(prop)]: expr } } };
}

/**
 * The result a server row becomes, or null for a row without the id its kind
 * opens by. The props read are those `GET /search` documents for each kind.
 */
export function toHit(
  kind: SearchKind,
  item: Item,
  t: TFunction,
  locale: string,
): SearchHit | null {
  const peek = (id: string, label: string, context: string[], ref: string | undefined) =>
    id === ""
      ? null
      : { key: `${kind}:${id}`, kind, label, context, ref, target: { peek: { kind, id } } };

  switch (kind) {
    case "node": {
      const id = text(item, "node_id");
      const fqdn = text(item, "fqdn");
      return peek(
        id,
        text(item, "nodename") || id,
        facts(
          text(item, "app"),
          text(item, "node_env"),
          fqdn === text(item, "nodename") ? "" : fqdn,
          text(item, "os_name"),
        ),
        shortRef(id),
      );
    }
    case "service": {
      const id = text(item, "svc_id");
      const cluster = shortRef(text(item, "cluster_id"));
      const hit = peek(
        id,
        text(item, "svcname") || id,
        facts(
          text(item, "svc_app"),
          text(item, "svc_env"),
          text(item, "svc_topology"),
          cluster === undefined ? "" : t("search.cluster", { id: cluster }),
        ),
        shortRef(id),
      );
      const status = text(item, "svc_availstatus");
      return hit === null || status === "" ? hit : { ...hit, state: statusBadge(status) };
    }
    case "instance": {
      const vmname = text(item, "mon_vmname");
      const id = toInstanceId(text(item, "svc_id"), text(item, "node_id"), vmname) ?? "";
      const svcname = text(item, "services.svcname");
      const nodename = text(item, "nodes.nodename");
      const hit = peek(
        id,
        t("search.instanceLabel", { service: svcname, node: nodename }),
        facts(vmname === "" ? "" : t("search.container", { name: vmname })),
        shortRef(text(item, "svc_id")),
      );
      const status = text(item, "mon_availstatus");
      return hit === null || status === "" ? hit : { ...hit, state: statusBadge(status) };
    }
    case "app": {
      // A badge opens an application by its code, which is unique.
      const code = text(item, "app");
      return peek(
        code,
        code,
        facts(text(item, "app_domain"), text(item, "description")),
        shortRef(text(item, "id")),
      );
    }
    case "network": {
      const mask = text(item, "mask");
      const addr = text(item, "addr");
      return peek(
        text(item, "id"),
        mask === "" ? addr : `${addr}/${mask}`,
        facts(text(item, "nodename"), text(item, "intf"), text(item, "net_name")),
        // The address itself tells the rows apart; the record id means nothing.
        undefined,
      );
    }
    case "disk": {
      const id = text(item, "disk_id");
      const size = item.disk_size;
      return peek(
        id,
        text(item, "disk_name") || id,
        facts(
          typeof size === "number" && size > 0 ? formatSizeMiB(size, locale) : "",
          text(item, "nodename"),
          text(item, "svcname"),
          text(item, "disk_arrayid"),
        ),
        // The WWN is the id one compares: kept whole.
        id,
      );
    }
    case "tag": {
      const exclude = text(item, "tag_exclude");
      return peek(
        text(item, "tag_id"),
        text(item, "tag_name"),
        facts(exclude === "" ? "" : t("search.tagExclude", { pattern: exclude })),
        undefined,
      );
    }
    case "user": {
      const id = text(item, "id");
      const email = text(item, "email");
      const name = [text(item, "first_name"), text(item, "last_name")].join(" ").trim();
      return peek(
        id,
        name || email,
        facts(name === "" ? "" : email, text(item, "username")),
        `#${id}`,
      );
    }
    case "group":
    case "privilege": {
      // Organizational and privilege groups alike open the record of the group.
      const id = text(item, "id");
      if (id === "") return null;
      return {
        key: `${kind}:${id}`,
        kind,
        label: text(item, "role"),
        context: facts(text(item, "description")),
        ref: `#${id}`,
        target: { peek: { kind: "group", id } },
      };
    }
    case "request": {
      const id = text(item, "id");
      if (id === "") return null;
      const last = text(item, "last_form_name");
      const name = text(item, "form_name");
      return {
        key: `${kind}:${id}`,
        kind,
        label: name,
        context: facts(
          last === name ? "" : last,
          text(item, "status"),
          text(item, "creator"),
          formatDate(text(item, "last_update"), locale),
        ),
        ref: `#${id}`,
        target: list("/requests/all", "id", `eq:${id}`),
      };
    }
    case "moduleset":
      return peek(
        text(item, "id"),
        text(item, "modset_name"),
        facts(text(item, "modset_author")),
        undefined,
      );
    case "ruleset": {
      return peek(
        text(item, "id"),
        text(item, "ruleset_name"),
        facts(
          text(item, "ruleset_type"),
          text(item, "ruleset_public") === "T" ? t("search.public") : "",
        ),
        undefined,
      );
    }
    case "filterset": {
      const id = text(item, "id");
      return peek(id, text(item, "fset_name"), facts(text(item, "fset_author")), `#${id}`);
    }
    case "form": {
      const id = text(item, "id");
      return peek(
        id,
        text(item, "form_name"),
        facts(text(item, "form_type"), text(item, "form_folder")),
        `#${id}`,
      );
    }
  }
}

/**
 * The list view of a kind and the columns the search looks into, in the order of
 * `GET /search`: what identifies the object first, then its context. Only the kinds
 * whose view filters by column.
 */
const LIST_COLUMNS: Partial<Record<SearchKind, { to: ListRoute; props: string[] }>> = {
  node: {
    to: "/nodes",
    props: ["nodename", "fqdn", "node_id", "app", "node_env", "os_name"],
  },
  service: {
    to: "/services",
    props: ["svcname", "svc_id", "svc_app", "svc_env", "svc_topology", "cluster_id"],
  },
  instance: {
    to: "/instances",
    props: ["services.svcname", "mon_vmname", "nodes.nodename", "svc_id"],
  },
  network: { to: "/networks", props: ["addr", "mac", "nodename", "intf", "net_name"] },
  request: {
    to: "/requests/all",
    props: ["form_name", "last_form_name", "status", "creator"],
  },
  moduleset: { to: "/compliance/modulesets", props: ["modset_name", "modset_author"] },
  ruleset: { to: "/compliance/rulesets", props: ["ruleset_name", "ruleset_type"] },
  form: { to: "/forms", props: ["form_name", "form_folder", "form_type"] },
};

/**
 * The list view showing the matches of a kind, for the kinds whose view filters by
 * column; the search text is a "contains" filter there, as here.
 *
 * The filter goes on the column the text was found in. The search looks into
 * several columns and a list combines its filters with "and", so one column has to
 * be chosen: the one in which the most results on display hold the text, the
 * earlier one in the order above when several do — the name rather than the
 * context. A text found in the interface of five addresses filters the interface,
 * not the address. When the results do not tell (a request found by its number),
 * the first column is used.
 */
export function listOfMatches(
  kind: SearchKind,
  query: string,
  items: readonly Item[],
): ListTarget | undefined {
  const list = LIST_COLUMNS[kind];
  if (list === undefined) return undefined;
  const needle = query.toLowerCase();
  let best = list.props[0] ?? "";
  let bestCount = 0;
  for (const prop of list.props) {
    const count = items.filter((item) => text(item, prop).toLowerCase().includes(needle)).length;
    if (count > bestCount) {
      best = prop;
      bestCount = count;
    }
  }
  return { to: list.to, search: { [filterKey(best)]: query } };
}
