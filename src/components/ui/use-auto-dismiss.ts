import { useEffect, useRef, useState } from "react";

/** Time to read a message, by its length, between `min` and `max` milliseconds. */
export function readingTime(text: string, min: number, max: number): number {
  return Math.min(max, Math.max(min, 4000 + text.length * 50));
}

/**
 * The time a notice stays, by the length of its text: 6 to 15 seconds, and 10 to
 * 20 when it reports a failure or a warning, which asks for more attention.
 */
export function noticeTime(text: string, serious: boolean): number {
  return serious ? readingTime(text, 10000, 20000) : readingTime(text, 6000, 15000);
}

/** Time left, at least, once a pause ends: a message is not removed under the eyes. */
const AFTER_PAUSE = 3000;

/** Length of the fade-out a message leaves with, in milliseconds. */
export const FADE_MS = 400;

/** Whether the user asked for less motion: the message then leaves at once. */
function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The handlers of the element holding a message, which pause its time. */
export interface DismissHandlers {
  onPointerMove: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: (event: { currentTarget: Element; relatedTarget: EventTarget | null }) => void;
}

/**
 * Calls `onDismiss` `duration` milliseconds after `key` changes (a new message),
 * unless paused: while the pointer is over the message or the focus inside it, the
 * time stops, and resumes with what was left, `AFTER_PAUSE` at least. No `key`, no
 * timer. `handlers` go on the element holding the message.
 *
 * The time up, the message first fades out: `leaving` is true for `FADE_MS`, for
 * the element to turn transparent, then `onDismiss` is called. Moving over it or
 * focusing it during the fade brings it back and pauses it. Where the user asked for
 * less motion, it leaves without a fade.
 *
 * The pointer pauses it by moving over it, not by being there: a message appearing
 * under a pointer left still (where the menu that triggered it was) would otherwise
 * wait forever.
 */
export function useAutoDismiss(
  key: unknown,
  duration: number,
  onDismiss: () => void,
): { handlers: DismissHandlers; leaving: boolean } {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // The message fading out, by its key: a new message starts fully shown.
  const [leavingKey, setLeavingKey] = useState<unknown>(null);
  const left = useRef(duration);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const leaving = key !== null && key !== undefined && leavingKey === key;

  // A new message starts its whole time again.
  useEffect(() => {
    left.current = duration;
  }, [key, duration]);

  const paused = hovered || focused;
  useEffect(() => {
    if (key === null || key === undefined || paused) return;
    const started = Date.now();
    const timer = setTimeout(() => {
      if (reducedMotion()) dismiss.current();
      else setLeavingKey(key);
    }, left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(AFTER_PAUSE, left.current - (Date.now() - started));
    };
  }, [key, paused]);

  // The fade done, the message goes.
  useEffect(() => {
    if (!leaving || paused) return;
    const timer = setTimeout(() => {
      dismiss.current();
    }, FADE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [leaving, paused]);

  return {
    leaving,
    handlers: {
      onPointerMove: () => {
        setHovered(true);
        setLeavingKey(null);
      },
      onPointerLeave: () => {
        setHovered(false);
      },
      onFocus: () => {
        setFocused(true);
        setLeavingKey(null);
      },
      onBlur: (event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setFocused(false);
      },
    },
  };
}
