/** The kind of a notice: its mark and colours, read with the mark rather than alone. */
export type NoticeTone = "info" | "success" | "warning" | "error";

/**
 * How a temporary message stands out: a card tinted in the colour of its outcome,
 * bordered with it, its mark in that colour and its text in the ink, readable on
 * every theme's soft tint.
 */
export const NOTICE_TONES: Record<NoticeTone, { mark: string; markClass: string; box: string }> = {
  info: { mark: "ℹ", markClass: "text-accent", box: "border-accent bg-accent-soft" },
  success: { mark: "●", markClass: "text-state-up", box: "border-state-up bg-state-up-soft" },
  warning: { mark: "▲", markClass: "text-state-warn", box: "border-state-warn bg-state-warn-soft" },
  error: { mark: "■", markClass: "text-state-down", box: "border-state-down bg-state-down-soft" },
};

/** The frame shared by the temporary messages, the tone's colours aside. */
export const NOTICE_CARD =
  "notice-in inline-flex max-w-full items-start gap-2 rounded-(--radius-panel) border px-3 py-1.5 font-medium text-ink shadow-sm";
