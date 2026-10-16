import { useSyncExternalStore } from "react";
import type { Query, QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

/**
 * Live updates: the oc3 messenger announces on a websocket each table of the
 * collector that changes (`<table>_change`, from the agents' feeds as from the
 * api), and the queries showing that table are refreshed, so that the views follow
 * without a reload.
 *
 * The socket is opened on this origin (`/realtime/<group>/<token>`, proxied to the
 * messenger) with a one-time token the api gives to the signed-in user
 * (`POST /realtime/token`). It reconnects by itself, waiting longer after each
 * failure; once back, everything on display is refreshed, the events missed
 * meanwhile being unknown. Events are gathered for a moment before refreshing: an
 * agent feeding its status touches several tables every few seconds.
 *
 * On a collector of many nodes, the status of some instance changes every few
 * seconds. The events the agents' feeds cause name the services and the nodes
 * they changed (`scope`): the queries of a service or a node panel are refreshed
 * only for their own object; an event naming none concerns any. Besides, a query
 * is refreshed live at most every MIN_LIVE_MS (its `meta.liveMinMs` when longer,
 * for the costly ones), and only by the tables of its `meta.liveTables` when it
 * lists them, rather than by every table mapped to its key root. A hidden page
 * refreshes nothing: the tables changed meanwhile are refreshed when it shows
 * again.
 */
export type RealtimeStatus = "off" | "connecting" | "live" | "retrying";

/** What a query tells of its live refreshes, in its `meta`. */
interface LiveMeta extends Record<string, unknown> {
  /** The tables whose changes refresh it; by default, every table of its key root. */
  liveTables?: readonly string[];
  /** The least time between two live refreshes, when longer than MIN_LIVE_MS. */
  liveMinMs?: number;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: LiveMeta;
  }
}

/**
 * The query key roots showing each table. A table no view shows is absent:
 * its events are ignored. `user_prefs` is left out on purpose: the preferences are
 * updated optimistically, and refreshing them on each save would undo a change
 * still being saved.
 */
const TABLE_KEYS: Record<string, readonly string[]> = {
  nodes: ["nodes", "node", "search", "object-label"],
  services: ["services", "service", "search", "object-label"],
  svcmon: ["instances", "instance", "service", "node", "services"],
  resmon: ["service", "instance", "resources", "resource"],
  // The actions the agents ran: the service tab, the Actions view and its detail.
  svcactions: ["service", "serviceActions", "agentAction"],
  resinfo: ["service", "instance"],
  dashboard: ["alerts", "alert", "node", "service"],
  action_queue: ["actions", "action"],
  tags: ["tags"],
  node_tags: ["tags", "node"],
  svc_tags: ["tags", "service"],
  apps: ["apps", "app"],
  apps_responsibles: ["apps", "app"],
  apps_publications: ["apps", "app"],
  auth_user: ["users", "user"],
  auth_group: ["groups", "group"],
  auth_membership: ["users", "user", "groups", "group"],
  field_constraints: ["field-constraints"],
  // The entries a group hides from the menu: the menu, and the panel of the group.
  group_hidden_menu_entries: ["user", "group"],
  gen_filtersets: ["filtersets", "filterset", "designer"],
  // The session filterset: `SessionFilter` reads the views again when it changes.
  gen_filterset_user: ["session-filterset"],
  gen_filtersets_filters: ["filtersets", "filterset", "designer"],
  gen_filters: ["filters", "filter", "filtersets", "filterset"],
  forms: ["forms", "form", "form-by-name"],
  forms_store: ["workflows"],
  workflows: ["workflows"],
  form_output_results: ["form-output-results", "workflows"],
  comp_moduleset: ["modulesets", "designer"],
  comp_moduleset_modules: ["modulesets", "designer"],
  comp_moduleset_moduleset: ["modulesets", "designer"],
  comp_moduleset_ruleset: ["modulesets", "rulesets", "designer"],
  comp_node_moduleset: ["node", "designer"],
  comp_modulesets_services: ["service", "designer"],
  comp_rulesets: ["rulesets", "designer"],
  comp_rulesets_variables: ["rulesets", "designer"],
  comp_rulesets_rulesets: ["rulesets", "designer"],
  comp_rulesets_filtersets: ["rulesets", "designer"],
  comp_rulesets_nodes: ["node", "designer"],
  comp_rulesets_services: ["service", "designer"],
  comp_status: ["compliance-logs", "compliance-status", "node", "service"],
  log: ["logs", "log"],
  diskinfo: ["disks", "disk", "node", "service"],
  svcdisks: ["disks", "disk", "node", "service"],
  stor_array: ["disks", "disk"],
  switches: ["switches"],
  metrics: ["metrics", "metric"],
  reports: ["reports", "report"],
  charts: ["charts", "chart"],
  node_ip: ["ips", "ip", "node", "networks"],
  node_hba: ["node", "service"],
  packages: ["packages", "node"],
  obsolescence: ["obsolescence", "obsolescence-setting"],
  // The feed of a node's checks publishes "checks", the API the tables it changes.
  checks: ["checks", "check", "node"],
  checks_live: ["checks", "check", "node"],
  checks_settings: ["checks", "check"],
  checks_defaults: ["check-defaults", "check-default"],
  gen_filterset_check_threshold: ["check-contextual", "check-contextual-one"],
};

/** Events are gathered this long before the queries are refreshed. */
const FLUSH_MS = 2000;
/** The least time between two live refreshes of a query. */
const MIN_LIVE_MS = 15 * 1000;
/** How long after a live refresh a change on screen is attributed to it. */
const LIVE_WINDOW_MS = 6000;
/** Waits between reconnections: 1 s, doubling up to a minute. */
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 60 * 1000;

let client: QueryClient | null = null;
let socket: WebSocket | null = null;
let status: RealtimeStatus = "off";
let attempt = 0;
let liveRefreshAt = 0;
let retryTimer: number | undefined;
let flushTimer: number | undefined;
/**
 * The objects a table change concerns: the services and the nodes the event names
 * in its `scope`, null when it names none, any object then.
 */
interface ChangeScope {
  svcIds: Set<string>;
  nodeIds: Set<string>;
}

/** The tables changed since the last refresh, waiting for it, with their scope. */
const pending = new Map<string, ChangeScope | null>();

/** Adds a change of the table to the pending ones, its scope joined to theirs. */
function addChange(table: string, scope: ChangeScope | null) {
  if (!pending.has(table)) {
    pending.set(table, scope);
    return;
  }
  const previous = pending.get(table) ?? null;
  if (previous === null || scope === null) {
    pending.set(table, null);
    return;
  }
  for (const id of scope.svcIds) previous.svcIds.add(id);
  for (const id of scope.nodeIds) previous.nodeIds.add(id);
}

/** The scope an event names, null when it names none or one not understood. */
function readScope(event: object): ChangeScope | null {
  if (!("scope" in event) || typeof event.scope !== "object" || event.scope === null) return null;
  const scope = event.scope as Record<string, unknown>;
  const ids = (value: unknown): Set<string> | null =>
    Array.isArray(value) && value.every((id) => typeof id === "string")
      ? new Set(value as string[])
      : null;
  const svcIds = ids(scope.svc_ids);
  const nodeIds = ids(scope.node_ids);
  return svcIds === null || nodeIds === null ? null : { svcIds, nodeIds };
}
/** The queries refreshed too recently, by query hash: refreshed when the timer ends. */
const deferred = new Map<string, number>();
/** The queries whose deferred refresh fell while the page was hidden: read on return. */
const staleWhileHidden = new Set<Query>();
const listeners = new Set<() => void>();

function setStatus(next: RealtimeStatus) {
  if (next === status) return;
  status = next;
  for (const listener of listeners) listener();
}

/**
 * Whether the object a query shows is among those a change concerns. The queries
 * of a service or a node panel, keyed `["service", <svc_id>, …]` or
 * `["node", <node_id>, …]`, and their labels, `["object-label", <kind>, <id>]`,
 * show one; the lists show any.
 */
function inScope(query: Query, scope: ChangeScope | null): boolean {
  if (scope === null) return true;
  const [root, first, second] = query.queryKey;
  // The labels of the panel history, keyed by the kind of object then its id.
  const [kind, id] = root === "object-label" ? [first, second] : [root, first];
  if (typeof id !== "string") return true;
  if (kind === "service") return scope.svcIds.has(id);
  if (kind === "node") return scope.nodeIds.has(id);
  return true;
}

/** Whether one of the changes refreshes the query. */
function concerns(query: Query, changes: ReadonlyMap<string, ChangeScope | null>): boolean {
  const root = query.queryKey[0];
  if (typeof root !== "string") return false;
  const own = query.meta?.liveTables;
  for (const [table, scope] of changes)
    if (
      (TABLE_KEYS[table] ?? []).includes(root) &&
      (own === undefined || own.includes(table)) &&
      inScope(query, scope)
    )
      return true;
  return false;
}

/** Refreshes one query, if still in the cache. */
function refresh(running: QueryClient, query: Query) {
  liveRefreshAt = Date.now();
  void running.invalidateQueries({ queryKey: query.queryKey, exact: true });
}

function flush() {
  flushTimer = undefined;
  const running = client;
  if (running === null) return;
  // Nothing is refreshed while the page is hidden: the tables stay pending until
  // it shows again (onVisibilityChange).
  if (document.hidden) return;
  const tables = new Map(pending);
  pending.clear();
  const now = Date.now();
  for (const query of running.getQueryCache().getAll()) {
    if (!concerns(query, tables) || deferred.has(query.queryHash)) continue;
    const least = Math.max(MIN_LIVE_MS, query.meta?.liveMinMs ?? 0);
    const wait = query.state.dataUpdatedAt + least - now;
    if (wait <= 0) {
      refresh(running, query);
      continue;
    }
    // Read too recently: refreshed once its least time has passed, whatever
    // changes meanwhile.
    deferred.set(
      query.queryHash,
      window.setTimeout(() => {
        deferred.delete(query.queryHash);
        if (client !== running) return;
        if (document.hidden) staleWhileHidden.add(query);
        else refresh(running, query);
      }, wait),
    );
  }
}

function onVisibilityChange() {
  if (document.hidden || client === null) return;
  const running = client;
  for (const query of staleWhileHidden) refresh(running, query);
  staleWhileHidden.clear();
  if (pending.size > 0 && flushTimer === undefined) flushTimer = window.setTimeout(flush, FLUSH_MS);
}

/**
 * When a live event last refreshed the views, 0 if none did lately: what changes
 * on screen in the few seconds that follow changed in the collector, and deserves
 * to be pointed out (`useFlash`).
 */
export function lastLiveRefresh(): number {
  return Date.now() - liveRefreshAt < LIVE_WINDOW_MS ? liveRefreshAt : 0;
}

/** What the messenger sends: a JSON event, or the "+name" / "-name" of a client coming or going. */
function onMessage(raw: unknown) {
  if (typeof raw !== "string" || !raw.startsWith("{")) return;
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  const events =
    typeof message === "object" && message !== null && "data" in message ? message.data : null;
  if (!Array.isArray(events)) return;
  for (const event of events as unknown[]) {
    const name =
      typeof event === "object" && event !== null && "event" in event ? event.event : null;
    if (typeof name !== "string" || !name.endsWith("_change")) continue;
    const table = name.slice(0, -"_change".length);
    if (table in TABLE_KEYS) addChange(table, readScope(event as object));
  }
  if (pending.size > 0 && flushTimer === undefined) flushTimer = window.setTimeout(flush, FLUSH_MS);
}

function retryLater() {
  if (client === null) return;
  setStatus("retrying");
  // A little randomness, so that every page does not come back at the same instant.
  const wait = Math.min(RETRY_MIN_MS * 2 ** attempt, RETRY_MAX_MS) * (0.75 + Math.random() / 2);
  attempt++;
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => {
    void connect();
  }, wait);
}

async function connect() {
  const running = client;
  if (running === null || socket !== null) return;
  if (attempt === 0) setStatus("connecting");
  let target: { token: string; group: string };
  try {
    const { data, error } = await api.POST("/realtime/token");
    if (error !== undefined) throw new Error("no token");
    target = data.data;
  } catch {
    retryLater();
    return;
  }
  // Stopped, or connected by another call, while the token was on its way.
  if (client !== running || socket !== null) return;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(
    `${scheme}://${window.location.host}/realtime/${encodeURIComponent(target.group)}/${encodeURIComponent(target.token)}`,
  );
  socket = ws;
  ws.onopen = () => {
    const reconnected = attempt > 0;
    attempt = 0;
    setStatus("live");
    // What changed while the socket was down is unknown: everything on display is
    // read again.
    if (reconnected) void running.invalidateQueries();
  };
  ws.onmessage = (event) => {
    onMessage(event.data);
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    retryLater();
  };
  ws.onerror = () => {
    ws.close();
  };
}

/** Starts the live updates of a signed-in session. */
export function startRealtime(queryClient: QueryClient): void {
  client = queryClient;
  attempt = 0;
  document.addEventListener("visibilitychange", onVisibilityChange);
  void connect();
}

/** Stops them, at sign-out: nothing is refreshed nor reconnected afterwards. */
export function stopRealtime(): void {
  client = null;
  window.clearTimeout(retryTimer);
  window.clearTimeout(flushTimer);
  retryTimer = undefined;
  flushTimer = undefined;
  pending.clear();
  for (const timer of deferred.values()) window.clearTimeout(timer);
  deferred.clear();
  staleWhileHidden.clear();
  document.removeEventListener("visibilitychange", onVisibilityChange);
  const ws = socket;
  socket = null;
  ws?.close();
  setStatus("off");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the views are following the collector live. */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribe, () => status);
}
