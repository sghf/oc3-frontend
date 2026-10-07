import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePanelSide } from "@/components/ui/panel-side";
import { useAnyPanelOpen } from "@/components/ui/slide-over-open";
import { HistoryIcon } from "@/components/ui/icons";
import { readLastRecord } from "@/components/opensvc/last-record";
import { useObjectLabels } from "@/components/opensvc/object-label";
import { isPeekStep } from "@/components/opensvc/panel-trail";
import { usePeek } from "@/components/opensvc/use-peek";
import { useRecordHistory } from "@/lib/record-history";
import { useShortcut } from "@/lib/shortcuts";

/**
 * The right edge of the side menu, in pixels from the left of the window, followed
 * as the menu folds and unfolds; 0 without a menu.
 */
function useMenuEdge(active: boolean): number {
  const [edge, setEdge] = useState(0);
  useEffect(() => {
    const menu = document.getElementById("app-sidebar");
    if (!active || menu === null) return;
    const measure = () => {
      setEdge(Math.max(0, menu.getBoundingClientRect().right));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(menu);
    return () => {
      observer.disconnect();
    };
  }, [active]);
  return edge;
}

/**
 * Anchor on the edge of the window the panels open against while no side panel is open: it brings
 * back the detail panel and its history, on the record shown last, or on the first
 * of the history when that one is no longer listed. Nothing to reopen, no anchor.
 * The "p" key does the same from the keyboard; with a record panel open, it closes
 * it (`SlideOver`). On the left, it stands against the side menu, not over it.
 */
export function PanelAnchor() {
  const { t } = useTranslation();
  const { side } = usePanelSide();
  const anyOpen = useAnyPanelOpen();
  // On the left, the anchor stands against the side menu rather than over it.
  const menuEdge = useMenuEdge(side === "left" && !anyOpen);
  const history = useRecordHistory();
  const peek = usePeek();
  const steps = history.entries.filter(isPeekStep);
  const last = readLastRecord();
  const target = steps.find((step) => step.kind === last?.kind && step.id === last.id) ?? steps[0];
  // Named only when it shows: a closed anchor asks nothing of the API.
  const [name] = useObjectLabels(target === undefined || anyOpen ? [] : [target]);

  useShortcut("p", () => {
    if (anyOpen || target === undefined) return false;
    peek(target.kind, target.id);
    return true;
  });

  if (anyOpen || target === undefined) return null;
  const label = `${t("panelHistory.reopen", { name: name ?? target.id, count: steps.length })} (p)`;

  return (
    <button
      type="button"
      title={label}
      aria-keyshortcuts="p"
      onClick={() => {
        peek(target.kind, target.id);
      }}
      // On the edge the panels open against.
      style={side === "left" ? { left: `${String(menuEdge)}px` } : undefined}
      className={`fixed top-14 z-10 flex items-center gap-1 border border-line bg-surface-raised py-1.5 text-ink-muted shadow-lg hover:text-ink ${
        side === "left"
          ? "rounded-r-(--radius-panel) border-l-0 pr-2 pl-1.5"
          : "right-0 rounded-l-(--radius-panel) border-r-0 pr-1.5 pl-2"
      }`}
    >
      <HistoryIcon className="h-4 w-4" />
      <span aria-hidden="true" className="text-data tabular-nums">
        {steps.length}
      </span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
