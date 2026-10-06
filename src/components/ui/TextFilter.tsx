import { useEffect, useId, useRef, useState } from "react";
import {
  fromTextDraft,
  isInverted,
  regexError,
  toTextDraft,
  type TextDraft,
} from "@/lib/column-filters";
import { AlertTriangleIcon, CloseIcon } from "./icons";

/** Pause in the typing after which the filter applies. */
const TYPING_DELAY = 400;

/** The operators the selector offers, and the prefix each one types. */
export type TextOperator = "contains" | "eq" | "ne" | "regex" | "gt" | "gte" | "lt" | "lte";

const PREFIXES: [Exclude<TextOperator, "contains" | "regex">, string][] = [
  // Two characters first, so that ">=" is not read as ">" followed by "=".
  ["gte", ">="],
  ["lte", "<="],
  ["ne", "!="],
  ["gt", ">"],
  ["lt", "<"],
  ["eq", "="],
];

const OPERATORS: TextOperator[] = ["contains", "eq", "ne", "regex", "gt", "gte", "lt", "lte"];

/** The operator a draft reads as, and its text without the operator. */
function operatorOf(draft: TextDraft): { operator: TextOperator; operand: string } {
  if (draft.regex) return { operator: "regex", operand: draft.text };
  for (const [operator, prefix] of PREFIXES)
    if (draft.text.startsWith(prefix))
      return { operator, operand: draft.text.slice(prefix.length).trimStart() };
  return { operator: "contains", operand: draft.text };
}

/** The draft with another operator, on the same operand. */
function withOperator(draft: TextDraft, operator: TextOperator): TextDraft {
  const { operand } = operatorOf(draft);
  if (operator === "regex") return { ...draft, regex: true, text: operand };
  if (operator === "contains") return { ...draft, regex: false, text: operand };
  const prefix = PREFIXES.find(([name]) => name === operator)?.[1] ?? "";
  return { ...draft, regex: false, text: prefix + operand };
}

/**
 * Text filter of a column: an operator chosen before the field (a substring by
 * default, equality, a regular expression, a comparison) and the text, and the rows
 * that do not match with the `≠` toggle on, where no other control inverts.
 *
 * `value` is the stored expression (`dev`, `~^dev`, `gte:8`, `!dev`…), `onChange`
 * receives the new one, or undefined to clear the filter. What is typed applies after
 * a short pause, or at once with Enter; the toggles and the clear button apply at once. A
 * regular expression the browser cannot compile is not sent: the field is marked
 * invalid, with an icon and a message beside the red border.
 */
export function TextFilter({
  value,
  onChange,
  label,
  invertLabel,
  clearLabel,
  invalidLabel,
  placeholder,
  operators,
  showInvert = true,
  roomy = false,
}: {
  value: string | undefined;
  onChange: (expr: string | undefined) => void;
  /** Accessible name of the field. */
  label: string;
  /** Name of the toggle keeping the rows that do not match. */
  invertLabel: string;
  clearLabel: string;
  /** Message for an invalid regular expression; receives the engine's reason. */
  invalidLabel: (reason: string) => string;
  placeholder?: string;
  /**
   * The names of the operators, for the selector before the field: it writes the
   * same prefixes one can type (`=`, `>=`…), or switches to a regular expression.
   */
  operators: { label: string; names: Record<TextOperator, string> };
  /** False where another control inverts the filter. */
  showInvert?: boolean;
  /** Taller, for a popover rather than a table row. */
  roomy?: boolean;
}) {
  const errorId = useId();
  const [draft, setDraft] = useState<TextDraft>(() => toTextDraft(value));
  // Last value received, and last value sent: a value that changes without having
  // been sent from here (a "clear all", a link) replaces what the field shows.
  const [seen, setSeen] = useState(value);
  const [sent, setSent] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== sent) {
      setSent(value);
      setDraft(toTextDraft(value));
    }
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const expr = fromTextDraft(draft);
  const error = regexError(expr);

  function commit(next: TextDraft) {
    clearTimeout(timer.current);
    const nextExpr = fromTextDraft(next);
    if (regexError(nextExpr) !== null) return;
    // A typed "!" has flipped the inversion: it moves from the text to the toggle.
    if (nextExpr !== undefined && next.inverted !== isInverted(nextExpr))
      setDraft(toTextDraft(nextExpr));
    if (nextExpr === value) return;
    setSent(nextExpr);
    onChange(nextExpr);
  }

  function edit(next: TextDraft, delay: number) {
    setDraft(next);
    clearTimeout(timer.current);
    if (delay === 0) {
      commit(next);
    } else {
      timer.current = setTimeout(() => {
        commit(next);
      }, delay);
    }
  }

  const field = (
    <div
      className={`flex ${roomy ? "h-7" : "h-6"} min-w-28 flex-1 items-center rounded-(--radius-control) border bg-surface font-normal focus-within:border-accent ${
        error === null ? "border-line" : "border-state-down"
      }`}
    >
      <input
        data-autofocus
        type="text"
        value={draft.text}
        onChange={(event) => {
          edit({ ...draft, text: event.target.value }, TYPING_DELAY);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          }
        }}
        aria-label={label}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : errorId}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        className={`w-full min-w-0 bg-transparent px-1.5 text-ink outline-none placeholder:text-ink-muted/70 ${
          draft.regex ? "font-mono" : ""
        }`}
      />
      {error !== null && (
        <span title={invalidLabel(error)} className="text-state-down">
          <AlertTriangleIcon className="h-3.5 w-3.5" />
          <span id={errorId} className="sr-only">
            {invalidLabel(error)}
          </span>
        </span>
      )}
      {draft.text !== "" && (
        <button
          type="button"
          onClick={() => {
            edit({ ...draft, text: "" }, 0);
          }}
          aria-label={clearLabel}
          title={clearLabel}
          className="px-0.5 text-ink-muted hover:text-ink"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      )}
      {showInvert && (
        <button
          type="button"
          aria-pressed={draft.inverted}
          onClick={() => {
            edit({ ...draft, inverted: !draft.inverted }, 0);
          }}
          aria-label={invertLabel}
          title={invertLabel}
          className="h-full rounded-r-(--radius-control) border-l border-line px-1 font-mono text-ink-muted hover:text-ink aria-pressed:bg-accent-soft aria-pressed:text-ink"
        >
          ≠
        </button>
      )}
    </div>
  );

  const { operator } = operatorOf(draft);
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={operator}
        onChange={(event) => {
          edit(withOperator(draft, event.target.value as TextOperator), 0);
        }}
        aria-label={operators.label}
        className={`${roomy ? "h-7" : "h-6"} shrink-0 rounded-(--radius-control) border border-line bg-surface px-1 text-ink`}
      >
        {OPERATORS.map((name) => (
          <option key={name} value={name}>
            {operators.names[name]}
          </option>
        ))}
      </select>
      {field}
    </div>
  );
}
