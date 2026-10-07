import { type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { InNoticeRegion } from "./NoticeRegion";
import { NOTICE_CARD, NOTICE_TONES, type NoticeTone } from "./notice-tones";

export type { NoticeTone } from "./notice-tones";
import { noticeTime, useAutoDismiss } from "./use-auto-dismiss";

/**
 * The report of something the user just did, shown in the area of the temporary
 * messages (NoticeRegion), outside the layout of the page, which leaves by itself after the time
 * to read it (see noticeTime), longer for a warning or an error, fading out; hovered
 * or focused, it waits, and its close button removes it at once. `id` tells one
 * report from the next: a new id starts the time again. A warning or an error is
 * announced as an alert, the others as a status.
 */
export function TransientNotice({
  id,
  tone,
  text,
  dismissLabel,
  onDismiss,
  className = "",
  children,
}: {
  id: unknown;
  tone: NoticeTone;
  /** The message, also measured for the time it stays. */
  text: string;
  dismissLabel: string;
  onDismiss: () => void;
  className?: string;
  /** Shown in place of `text`, when the message is more than words. */
  children?: ReactNode;
}) {
  const serious = tone === "warning" || tone === "error";
  const dismissal = useAutoDismiss(id, noticeTime(text, serious), onDismiss);
  const { mark, markClass, box } = NOTICE_TONES[tone];
  return (
    <InNoticeRegion>
      <div
        {...dismissal.handlers}
        className={`${NOTICE_CARD} ${box} transition-opacity duration-400 motion-reduce:transition-none ${dismissal.leaving ? "opacity-0" : "opacity-100"} ${className}`}
      >
        <span aria-hidden="true" className={markClass}>
          {mark}
        </span>
        <p role={serious ? "alert" : "status"}>{children ?? text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-(--radius-control) text-ink-muted hover:bg-surface hover:text-ink"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      </div>
    </InNoticeRegion>
  );
}
