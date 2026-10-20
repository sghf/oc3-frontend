import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { startRealtime, stopRealtime, useRealtimeStatus } from "@/lib/realtime";
import { useImpersonation } from "@/lib/api/impersonation";
import { useShortcut } from "@/lib/shortcuts";

const LIVE_KEY = "oc3.live";

const STATES = ["live", "offline", "paused", "refreshing", "refreshed"] as const;

/** Live mode is a comfort of the browser, as the folded menu: kept there, not with the account. */
function readLiveEnabled(): boolean {
  try {
    return localStorage.getItem(LIVE_KEY) !== "off";
  } catch {
    // Storage refused: live mode stays on, as by default.
    return true;
  }
}

/**
 * Live updates of the signed-in session, and their switch in the top bar: a filled
 * dot and "Live" while the views follow the collector, a hollow one and "Offline"
 * while the connection is being made again, two bars and "Paused" once turned off.
 * The mark and the word, not a tint alone, tell the states apart. A click turns
 * live mode off — the WebSocket closes, and the views refresh only when one
 * navigates, sorts or reloads — or back on, which also refreshes what is on display
 * to catch up. The choice is kept by the browser. Rendered only once someone is
 * signed in: the connection starts with it and stops at sign-out.
 *
 * "r" reads the data again by hand, live or not, as the historical collector's
 * key did: every view on display is refetched at once, the others when shown.
 * The switch says "Refreshing…" meanwhile, then "Refreshed" for a moment.
 */
export function LiveIndicator() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useRealtimeStatus();
  const [enabled, setEnabled] = useState(readLiveEnabled);
  // The token is given to the identity the requests are made as: a new one, and a
  // new socket, when the administrator starts or stops acting as another user.
  const actingAs = useImpersonation()?.userId;
  const [refresh, setRefresh] = useState<"idle" | "refreshing" | "refreshed">("idle");

  useShortcut("r", () => {
    setRefresh("refreshing");
    void queryClient.invalidateQueries().finally(() => {
      setRefresh("refreshed");
    });
    return true;
  });

  useEffect(() => {
    if (refresh !== "refreshed") return;
    const timer = window.setTimeout(() => {
      setRefresh("idle");
    }, 1500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    startRealtime(queryClient);
    return stopRealtime;
  }, [queryClient, enabled, actingAs]);

  function toggle() {
    const next = !enabled;
    try {
      localStorage.setItem(LIVE_KEY, next ? "on" : "off");
    } catch {
      // Not remembered: the choice holds until the page is reloaded.
    }
    setEnabled(next);
    // Back on: what changed while paused is read again.
    if (next) void queryClient.invalidateQueries();
  }

  const live = enabled && status === "live";
  const state = !enabled ? "paused" : live ? "live" : "offline";
  const hint = {
    live: t("realtime.liveHint"),
    offline: t("realtime.offlineHint"),
    paused: t("realtime.pausedHint"),
  }[state];
  const action = enabled ? t("realtime.turnOff") : t("realtime.turnOn");
  const labels = {
    live: t("realtime.live"),
    offline: t("realtime.offline"),
    paused: t("realtime.paused"),
    refreshing: t("realtime.refreshing"),
    refreshed: t("realtime.refreshed"),
  };
  const shown = refresh === "idle" ? state : refresh;

  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={toggle}
      title={`${hint}\n${action}\n${t("realtime.refreshHint")}`}
      className={`flex items-center gap-1.5 rounded-(--radius-control) px-1 py-0.5 text-data hover:bg-surface-sunken ${
        state === "offline" ? "text-state-warn" : "text-ink-muted"
      }`}
    >
      {state === "paused" ? (
        // Two bars: the pause mark, whatever the colour.
        <span aria-hidden="true" className="flex h-2 w-2 justify-between">
          <span className="w-0.5 bg-current" />
          <span className="w-0.5 bg-current" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full border ${live ? "border-state-up bg-state-up" : "border-current"}`}
        />
      )}
      {/* The words in one cell, the others hidden: the button keeps the width of
          the longest, and the top bar does not shift when the state changes. */}
      <span className="grid">
        {STATES.map((each) =>
          each === shown ? (
            <span key={each} role="status" className="col-start-1 row-start-1">
              {labels[each]}
            </span>
          ) : (
            <span key={each} aria-hidden="true" className="invisible col-start-1 row-start-1">
              {labels[each]}
            </span>
          ),
        )}
      </span>
      <span className="sr-only">{action}</span>
    </button>
  );
}
