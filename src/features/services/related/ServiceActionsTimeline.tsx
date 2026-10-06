import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActionTargets, ScheduledMark } from "@/components/opensvc/AgentActionParts";
import {
  TARGETS_SHOWN,
  actionState,
  actionTargets,
  type AgentAction,
} from "@/components/opensvc/agent-action";
import { Timeline, type TimelineRange, type TimelineTrack } from "@/components/ui/Timeline";
import { parseCollectorDate } from "@/lib/format";

/**
 * The actions of a period on a time axis, as the historical actions timeline
 * (`actions_timeline.js`): a track per node, a bar per action from its begin to its
 * end, in the colour of its status, read with its word in the legend, the tooltip
 * and the table. An action still running reaches the right edge, "ongoing".
 * Selecting a bar, by a click or Enter, selects the action in the list and opens
 * its log; the action selected in the list is outlined here.
 */
export function ServiceActionsTimeline({
  actions,
  days,
  locale,
  selectedId,
  onSelect,
}: {
  actions: AgentAction[];
  days: number;
  locale: string;
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  // The right edge of the axis, taken with the actions: it moves when they are
  // read again, not on every render.
  const { now, tracks } = useMemo(() => {
    const at = Date.now() / 1000;
    return { now: at, tracks: toTracks(actions, at, t) };
  }, [actions, t]);
  const byKey = new Map(actions.map((action) => [String(action.id), action]));
  const selected = actions.find((action) => action.id === selectedId);

  return (
    <Timeline
      tracks={tracks}
      now={now}
      from={now - days * 86400}
      locale={locale}
      labels={{
        title: t("services.actions.timeline.title", { count: days }),
        ongoing: t("services.actions.timeline.ongoing"),
        start: t("services.actions.fields.begin"),
        end: t("services.actions.timeline.end"),
        duration: t("services.actions.fields.time"),
        showTable: t("services.actions.timeline.showTable"),
        status: t("services.actions.fields.status"),
        track: t("services.actions.fields.node"),
        action: t("services.actions.fields.action"),
        selectHint: t("services.actions.timeline.selectHint"),
      }}
      selected={selected === undefined ? undefined : `${nodeKey(selected)}/${String(selected.id)}`}
      onSelect={(range) => {
        const id = Number(range.key);
        if (!Number.isNaN(id)) onSelect(id);
      }}
      // The order of the statuses, not of the actions that happened first.
      legendOrder={["ok", "warn", "err", "running"].map((status) =>
        t(`agentActions.statusNames.${status}`),
      )}
      rowAction={(range) => {
        const action = byKey.get(range.key);
        if (action === undefined) return null;
        return (
          <span className="flex items-center gap-1.5">
            <ScheduledMark cron={action.cron} />
            <span>{action.action}</span>
            <ActionTargets subset={action.subset} rid={action.rid} />
          </span>
        );
      }}
    />
  );
}

function nodeKey(action: AgentAction): string {
  return action.node_id ?? "";
}

/**
 * The tracks of the timeline: a node each, by name, its actions in the order they
 * began, as the keyboard steps through them.
 */
function toTracks(
  actions: AgentAction[],
  now: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): TimelineTrack[] {
  const tracks = new Map<string, TimelineTrack>();
  for (const action of actions) {
    const begin = parseCollectorDate(action.begin)?.getTime();
    if (begin === undefined) continue;
    const start = begin / 1000;
    const endDate = parseCollectorDate(action.end ?? undefined)?.getTime();
    const running =
      endDate === undefined &&
      (action.status === "" || action.status === null || action.status === undefined);
    // An end never reported on a finished action: a mark at its begin.
    const end = endDate !== undefined ? endDate / 1000 : running ? now : start;
    const { state, labelKey } = actionState(action.status);
    const targets = actionTargets(action.subset, action.rid);
    const more = targets.length - TARGETS_SHOWN;
    const note = [
      action.action ?? "",
      targets.length === 0
        ? ""
        : targets.slice(0, TARGETS_SHOWN).join(", ") + (more > 0 ? ` +${String(more)}` : ""),
      action.cron === 1 ? t("agentActions.scheduled") : "",
    ]
      .filter((part) => part !== "")
      .join(" · ");
    const range: TimelineRange = {
      key: String(action.id),
      start,
      end: Math.max(start, end),
      ongoing: running,
      tone: state,
      label: t(labelKey),
      note,
    };
    const key = nodeKey(action);
    const track = tracks.get(key);
    if (track === undefined)
      tracks.set(key, {
        key,
        label: action["nodes.nodename"] ?? action.node_id ?? undefined,
        ranges: [range],
      });
    else track.ranges.push(range);
  }
  return [...tracks.values()]
    .map((track) => ({ ...track, ranges: track.ranges.sort((a, b) => a.start - b.start) }))
    .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
}
