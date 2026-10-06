import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
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
 */
export type RealtimeStatus = "off" | "connecting" | "live" | "retrying";

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
  comp_status: ["compliance-logs", "node", "service"],
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
};

/** Events are gathered this long before the queries are refreshed. */
const FLUSH_MS = 2000;
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
const pending = new Set<string>();
const listeners = new Set<() => void>();

function setStatus(next: RealtimeStatus) {
  if (next === status) return;
  status = next;
  for (const listener of listeners) listener();
}

function flush() {
  flushTimer = undefined;
  const roots = [...pending];
  pending.clear();
  liveRefreshAt = Date.now();
  for (const root of roots) void client?.invalidateQueries({ queryKey: [root] });
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
    for (const root of TABLE_KEYS[name.slice(0, -"_change".length)] ?? []) pending.add(root);
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
