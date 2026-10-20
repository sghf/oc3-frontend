import { useTranslation } from "react-i18next";
import type { RunStatus, RunStepStatus, RunTargetStatus } from "./api";

type AnyStatus = RunStatus | RunStepStatus | RunTargetStatus;

/** A glyph and a tint per status: the glyph tells them apart without colour. */
const LOOKS: Record<AnyStatus, { glyph: string; box: string }> = {
  succeeded: { glyph: "✓", box: "bg-state-up-soft text-state-up" },
  ok: { glyph: "✓", box: "bg-state-up-soft text-state-up" },
  running: { glyph: "●", box: "bg-accent-soft text-accent" },
  queued: { glyph: "◔", box: "bg-accent-soft text-accent" },
  waiting: { glyph: "○", box: "bg-surface-sunken text-ink-muted" },
  failed: { glyph: "✕", box: "bg-state-down-soft text-state-down" },
  refused: { glyph: "✕", box: "bg-state-down-soft text-state-down" },
  timed_out: { glyph: "✕", box: "bg-state-down-soft text-state-down" },
  cancelled: { glyph: "■", box: "bg-state-warn-soft text-state-warn" },
  stopped: { glyph: "■", box: "bg-state-warn-soft text-state-warn" },
  not_run: { glyph: "⊘", box: "border border-dashed border-line-strong text-ink-muted" },
};

/**
 * The status of a run, of a step or of a target, as a pill: its glyph and its
 * word, `count` before the word when the pill counts targets.
 */
export function RunStatusPill({
  status,
  count,
  suffix,
}: {
  status: AnyStatus;
  count?: number;
  /** Said after the status, "· step 2 of 3" say. */
  suffix?: string;
}) {
  const { t } = useTranslation();
  const look = LOOKS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 text-data leading-5 whitespace-nowrap ${look.box}`}
    >
      <span aria-hidden="true">{look.glyph}</span>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
      {t(`orchestrations.status.${status}`)}
      {suffix !== undefined && <span>{suffix}</span>}
    </span>
  );
}
