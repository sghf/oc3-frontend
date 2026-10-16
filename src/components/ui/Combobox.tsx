import { useEffect, useId, useRef, useState, type CSSProperties, type Ref } from "react";

export interface ComboboxOption {
  value: string;
  label: string;
}

/**
 * Dropdown list filtered from the keyboard, following the "combobox" pattern of the
 * ARIA Authoring Practices: a text field that filters a list of options.
 *
 * Written here rather than imported: a few dozen lines are enough for a substring
 * filter, and a native `<select>` cannot be filtered beyond the first letter.
 *
 * As long as nothing is typed, the field shows the chosen option and the list shows
 * everything; taking the focus selects that text, so that the first keystroke
 * filters instead of lengthening the value. Typing filters case-insensitively and
 * clears the current choice, which is restored only by choosing an option: with the
 * mouse, or with the arrows and Enter, which only chooses. Escape closes the list
 * without reaching the parent panel; with the list closed, Enter submits the
 * surrounding form as in any field. The list is in the page while open only.
 *
 * With `freeText`, the options are only suggestions: the text typed is the value,
 * and no option is active until an arrow key picks one, so that Enter keeps the
 * text as typed rather than completing it.
 */
export function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder,
  emptyText,
  className = "",
  inputRef,
  accent = false,
  id,
  disabled = false,
  invalid = false,
  describedBy,
  style,
  inputClassName = "h-7",
  freeText = false,
}: {
  options: ComboboxOption[];
  /** Value of the chosen option, "" when none. */
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the field. */
  label: string;
  placeholder?: string;
  /** Shown in the list when the filter leaves nothing in it. */
  emptyText: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Accent border and weight: the choice is one in force, worth noticing. */
  accent?: boolean;
  /** Id of the field, for a `<label htmlFor>` around it. */
  id?: string;
  /** The choice is shown and cannot be changed. */
  disabled?: boolean;
  /** The choice breaks a rule of the surrounding form: border in the state colour. */
  invalid?: boolean;
  /** Ids of the texts describing the field, its help or its error. */
  describedBy?: string;
  /** Style of the wrapper, a width for instance. */
  style?: CSSProperties;
  /** Height and spacing of the field, to line up with the controls around it. */
  inputClassName?: string;
  /** Any text typed is the value; the options are suggestions. */
  freeText?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  // null: nothing typed since the last choice, the field shows the chosen option.
  const [query, setQuery] = useState<string | null>(null);
  // -1: no option active, the free text typed stands.
  const noActive = freeText ? -1 : 0;
  const [active, setActive] = useState(noActive);
  const list = useRef<HTMLUListElement>(null);

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? (freeText ? value : "");
  const needle = (query ?? "").trim().toLowerCase();
  const filtered =
    needle === ""
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(needle));
  const activeIndex = Math.min(active, filtered.length - 1);
  const activeOption = open && activeIndex >= 0 ? filtered[activeIndex] : undefined;

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function choose(option: ComboboxOption) {
    onChange(option.value);
    setQuery(null);
    setOpen(false);
  }

  function optionId(index: number) {
    return `${listId}-${String(index)}`;
  }

  return (
    <div className={`relative ${className}`} style={style}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeOption === undefined ? undefined : optionId(activeIndex)}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={query ?? selectedLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(noActive);
          setOpen(true);
          if (freeText) onChange(event.target.value);
          else if (value !== "") onChange("");
        }}
        onFocus={(event) => {
          // The field arrives filled with the chosen option: selecting it straight away
          // allows filtering by typing, instead of lengthening the existing value.
          event.currentTarget.select();
          setOpen(true);
        }}
        onMouseUp={(event) => {
          // A click puts the caret in the text and undoes the selection made on focus:
          // without this, typing would stick the filter onto the option already chosen,
          // and the list would have nothing left to show. Reselecting must happen on
          // release, once the caret is placed.
          if (query === null) event.currentTarget.select();
        }}
        onClick={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
        onKeyDown={(event) => {
          switch (event.key) {
            case "ArrowDown":
            case "ArrowUp": {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                return;
              }
              const step = event.key === "ArrowDown" ? 1 : -1;
              const from = activeIndex < 0 && step < 0 ? 0 : activeIndex;
              setActive((filtered.length + from + step) % Math.max(filtered.length, 1));
              return;
            }
            case "Enter":
              if (activeOption !== undefined) {
                // This first Enter chooses, and nothing more: a form around the field
                // must not take it for a submission. The next one, with the list
                // closed, belongs to the form.
                event.preventDefault();
                event.stopPropagation();
                choose(activeOption);
              } else if (!freeText && needle !== "") {
                // Text matching no option: the value is empty meanwhile, and letting
                // the form have this Enter would submit that, clearing the field. An
                // empty field, on purpose, still submits.
                event.preventDefault();
                event.stopPropagation();
              }
              return;
            case "Escape":
              if (open) {
                event.stopPropagation();
                setOpen(false);
              }
              return;
          }
        }}
        className={`${inputClassName} w-full rounded-(--radius-control) border bg-surface px-2 disabled:opacity-70 ${invalid ? "border-state-down" : accent ? "border-accent font-medium" : "border-line"}`}
      />
      {/* Mounted while open only: a closed list kept in the page, hidden, made
          React lose track of the nodes around it when an entry holding the field
          was removed from a repeated form (removeChild on the wrong parent). */}
      {/* Free text matching no suggestion: nothing to show, the text stands. */}
      {open && !(freeText && filtered.length === 0) && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full right-0 left-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-(--radius-control) border border-line bg-surface-raised py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-1 text-ink-muted">{emptyText}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={option.value === value}
                // Before the blur of the field, which would close the list under the click.
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onMouseEnter={() => {
                  setActive(index);
                }}
                onClick={() => {
                  choose(option);
                }}
                className={`cursor-pointer px-2 py-1 ${index === activeIndex ? "bg-accent-soft text-ink" : ""} ${option.value === value ? "font-semibold" : ""}`}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
