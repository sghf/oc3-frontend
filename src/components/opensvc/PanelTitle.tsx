import { useEffect, useRef, type ReactNode } from "react";
import type { PeekStep } from "@/lib/peek-trail";
import { useRecordHistory } from "@/lib/record-history";
import { ObjectIcon, type ObjectKind } from "./ObjectIcon";
import { recordKey, setShownRecord } from "./panel-history";
import { rememberLastRecord } from "./last-record";
import { isPeekStep } from "./panel-trail";

/**
 * Title of a record panel: the icon of its kind and its name, the header's alone.
 *
 * The title also records the record it shows in the panel history, kept by the
 * browser tab, whatever opened it — a list row, a badge, the search, a bookmark, the
 * history itself: it enters, or comes back, in front, with the time it is. The
 * global search proposes that history before anything is typed (`GlobalSearch`),
 * the record on display said so (`setShownRecord`).
 */
export function PanelTitle({
  kind,
  title,
  recordId,
  open,
  actions,
}: {
  kind: ObjectKind;
  title: string;
  recordId: string | undefined;
  open: boolean;
  /** What is done on the record, right after its title: shown whatever the tab. */
  actions?: ReactNode;
}) {
  const history = useRecordHistory();
  const currentKey = recordKey(kind, recordId);
  const current: PeekStep | null =
    recordId === undefined || recordId === "" ? null : { kind, id: recordId };

  const record = useRef(history.record);
  record.current = history.record;
  useEffect(() => {
    if (!open || current === null || !isPeekStep(current)) return;
    record.current(current.kind, current.id);
    rememberLastRecord(current);
    setShownRecord(currentKey);
    return () => {
      setShownRecord("");
    };
    // current is derived from currentKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentKey]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <ObjectIcon kind={kind} />
      <h2 className="truncate text-title font-semibold">{title}</h2>
      {actions !== undefined && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
