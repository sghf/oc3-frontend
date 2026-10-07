import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Button for an irreversible action: the first click arms it, the second confirms.
 * Two steps rather than a modal window, to stay on the keyboard and without a focus
 * trap. The confirm button takes the focus as soon as it is armed, which reads the
 * question out to screen readers.
 *
 * When the action reaches further than its object, `details` tells how, under the
 * question, and `acknowledge` asks for a box to be ticked before the confirmation
 * is possible; the focus then goes to the box.
 */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  pending = false,
  icon,
  inline = false,
  details,
  acknowledge,
  blocked = false,
  onArm,
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel: string;
  pending?: boolean;
  /** Visual placed before the label of the arming button. */
  icon?: ReactNode;
  /**
   * The question and its buttons take the place of the arming button on the same
   * line and at the same height, instead of a question above the buttons: for a
   * strip, a bar at the foot of the page say, which must not grow while it asks.
   */
  inline?: boolean;
  /** Shown under the question once armed: what else the action does. */
  details?: ReactNode;
  /** Label of a box to tick before the confirmation is possible. */
  acknowledge?: string;
  /** The confirmation is not possible yet: what it would do is still being read. */
  blocked?: boolean;
  /** Called on arming: to read again what the action would reach, say. */
  onArm?: () => void;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const detailsId = useId();

  useEffect(() => {
    if (!armed) return;
    if (acknowledge === undefined) confirm.current?.focus();
    else box.current?.focus();
    // The focus moves once, on arming; a box appearing later keeps it where it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => {
          setAcknowledged(false);
          setArmed(true);
          onArm?.();
        }}
        className="flex h-8 items-center gap-2 rounded-(--radius-control) border border-line px-3 font-medium text-state-down"
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={question}
      aria-describedby={details === undefined ? undefined : detailsId}
      className={inline ? "flex items-center gap-2 whitespace-nowrap" : undefined}
    >
      {inline ? <span>{question}</span> : <p className="mb-2">{question}</p>}
      {details !== undefined && (
        <div id={detailsId} className="mb-2">
          {details}
        </div>
      )}
      {acknowledge !== undefined && (
        <label className="mb-2 flex cursor-pointer items-start gap-2 font-medium">
          <input
            ref={box}
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => {
              setAcknowledged(event.target.checked);
            }}
            className="mt-0.5"
          />
          {acknowledge}
        </label>
      )}
      <div className="flex gap-2">
        <button
          ref={confirm}
          type="button"
          disabled={pending || blocked || (acknowledge !== undefined && !acknowledged)}
          onClick={onConfirm}
          className="h-8 rounded-(--radius-control) bg-state-down px-3 font-medium text-surface-raised disabled:opacity-60"
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmed(false);
          }}
          className="h-8 rounded-(--radius-control) border border-line px-3"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
