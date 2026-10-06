import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SlideOver } from "@/components/ui/SlideOver";
import { CheckIcon, CloseIcon, PencilIcon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/Switch";
import { Combobox } from "@/components/ui/Combobox";
import type { ObjectKind } from "./ObjectIcon";
import { ColumnFamilyIcon, type ColumnFamily } from "./ColumnFamily";
import { readPropAsString } from "@/lib/row";
import { problemText } from "@/lib/api/problem";
import { BookmarkButton } from "./BookmarkButton";
import { FlashScope, FlashValue } from "./Flash";
import { PanelHistoryRail } from "./PanelHistory";
import { PanelTitle } from "./PanelTitle";
import { recordKey } from "./panel-history";
import { BOOKMARK_KINDS } from "./bookmark-kinds";

export interface DetailField<T> {
  /** Name of the apicollector prop: serves as label key and React key. */
  prop: string;
  format: (row: T, locale: string) => string | undefined;
  /**
   * Display of the value when it deserves better than text: the badge of an object
   * from another view, for instance. `format` stays the raw value, which decides
   * whether the row is shown and serves for editing.
   */
  render?: (row: T, locale: string) => ReactNode;
  /**
   * True for an attribute the user may set. Only those the agent's inventory push
   * does not overwrite are listed: changing the others would hold only until the
   * next push.
   */
  editable?: boolean;
  /**
   * Nature of the input; "text" by default. It also decides the type sent: the API
   * body expects an integer for `power_supply_nb` and a boolean for `notifications`,
   * and refuses the equivalent string.
   */
  input?: "text" | "date" | "number" | "boolean";
  /**
   * Values offered for the input, when the attribute has a known list of them:
   * editing then happens in a dropdown rather than in free text. The list comes from
   * the caller, who alone knows how to query it.
   */
  optionsKey?: string;
}

export interface DetailGroup<T> {
  key: string;
  /** Subject of the group, in the vocabulary of the column families. */
  family: ColumnFamily;
  fields: DetailField<T>[];
}

/**
 * Boolean spellings of the collector: "T" / "F" most of the time, 0 / 1 for the
 * `tinyint` and some `varchar(1)`. Any other value is shown as text: better to show
 * it as it is than to file it away on the "no" side.
 */
const TRUE_SPELLINGS = new Set(["T", "1"]);
const FALSE_SPELLINGS = new Set(["F", "0"]);

function readBoolean(raw: string): boolean | undefined {
  if (TRUE_SPELLINGS.has(raw)) return true;
  if (FALSE_SPELLINGS.has(raw)) return false;
  return undefined;
}

/** Value sent to the API, in the type its body expects. */
function toPayload(input: DetailField<unknown>["input"], value: string): string | number | boolean {
  if (input === "boolean") return value === "true";
  if (input === "number") return value === "" ? 0 : Number(value);
  return value;
}

/**
 * The collector stores its dates as "YYYY-MM-DD hh:mm:ss"; a date input only
 * accepts the calendar part.
 */
function toDateInput(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

interface DetailContentProps<T> {
  groups: DetailGroup<T>[];
  row: T | null | undefined;
  /** i18n namespace of the property labels, e.g. "services.fields". */
  labelPrefix: string;
  /** i18n namespace of the group titles, e.g. "services.detail.groups". */
  groupPrefix: string;
  isPending: boolean;
  errorMessage: string | null;
  /** Actions on the object on display, for example deleting it. */
  actions?: ReactNode;
  /** Saves a property. Rejects to signal a refusal from the server. */
  onSave?: (changes: Record<string, string | number | boolean>) => Promise<void>;
  /**
   * Note shown under the properties when editing is possible. By default the one for
   * nodes, part of whose attributes come from the agent; every object whose rule
   * differs provides its own, or the empty string for none.
   */
  editHint?: string;
  /**
   * Values offered for the attributes that declare a list of them (`optionsKey`).
   * The caller provides them: it alone knows where to look, teams for instance. An
   * empty list leaves the input free.
   */
  options?: Record<string, string[]>;
  /**
   * False when the caller titles the groups itself, such as a card per group: the
   * heading of each group is then left out. True by default.
   */
  groupTitles?: boolean;
  /**
   * Width of the label column, a CSS length, for lists placed side by side to line
   * up; by default each list sizes it to its own labels.
   */
  labelWidth?: string;
  /**
   * Content closing a group, by group key, such as the status history at the end
   * of the state: shown even when the group has no attribute to show.
   */
  groupFooters?: Partial<Record<string, ReactNode>>;
}

/**
 * Properties of a collector object, in groups of definition lists, without a frame:
 * the `DetailPanel` drawer and the full pages such as the profile each place them in
 * their own layout. Loading is done by the caller, which alone knows its endpoint.
 *
 * When `onSave` is provided, the attributes marked as editable carry a pencil on
 * hover, which switches that one property to an input.
 */
export function DetailContent<T>({
  groups,
  row,
  labelPrefix,
  groupPrefix,
  isPending,
  errorMessage,
  actions,
  onSave,
  editHint,
  options,
  groupTitles = true,
  labelWidth,
  groupFooters,
}: DetailContentProps<T>) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canEdit = onSave !== undefined && row !== null && row !== undefined;

  function startEditing(field: DetailField<T>) {
    if (row === null || row === undefined) return;
    const raw = readPropAsString(row, field.prop);
    setSaveError(null);
    setEditing(field.prop);
    setValue(field.input === "date" ? toDateInput(raw) : raw);
  }

  function cancel() {
    setEditing(null);
    setSaveError(null);
  }

  /** Immediate toggle of a boolean: the switch is already the control. */
  async function toggleBoolean(field: DetailField<T>, next: boolean) {
    if (onSave === undefined) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ [field.prop]: next });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : problemText(error));
    } finally {
      setSaving(false);
    }
  }

  async function commit(field: DetailField<T>) {
    if (row === null || row === undefined || onSave === undefined) return;
    const before =
      field.input === "date"
        ? toDateInput(readPropAsString(row, field.prop))
        : readPropAsString(row, field.prop);
    if (value === before) {
      cancel();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ [field.prop]: toPayload(field.input, value) });
      setEditing(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : problemText(error));
    } finally {
      setSaving(false);
    }
  }

  function onFieldKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLDivElement>,
    field: DetailField<T>,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit(field);
    } else if (event.key === "Escape") {
      // The panel listens for Escape at the document level: without this, cancelling
      // an input would close the panel as well.
      event.stopPropagation();
      cancel();
    }
  }

  return (
    <>
      {isPending && <p className="text-ink-muted">{t("detail.loading")}</p>}

      {errorMessage !== null && (
        <p role="alert" className="text-state-down">
          ■ {t("detail.error", { message: errorMessage })}
        </p>
      )}

      {row === null && !isPending && <p className="text-ink-muted">{t("detail.missing")}</p>}

      {row !== null && row !== undefined && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            // Empty columns are legion in the collector: only what is filled in is
            // shown. An editable attribute stays visible even when empty, without which
            // there would be nothing to hover over to fill it in.
            const entries = group.fields
              .map((field) => ({ field, value: field.format(row, locale) }))
              .filter(
                (entry) =>
                  (canEdit && entry.field.editable === true) ||
                  (entry.value !== undefined && entry.value !== ""),
              );
            const footer = groupFooters?.[group.key];
            if (entries.length === 0 && footer === undefined) return null;
            return (
              <section key={group.key}>
                {groupTitles && (
                  <h3 className="mb-1 flex items-center gap-2 font-semibold text-ink-muted">
                    <ColumnFamilyIcon family={group.family} />
                    {t(`${groupPrefix}.${group.key}`)}
                  </h3>
                )}
                <dl
                  className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-1 text-data"
                  style={
                    labelWidth === undefined
                      ? undefined
                      : { gridTemplateColumns: `${labelWidth} minmax(0, 1fr)` }
                  }
                >
                  {entries.map(({ field, value: shown }) => {
                    const label = t(`${labelPrefix}.${field.prop}`);
                    const isEditing = editing === field.prop;
                    // A dropdown only if there is something to fill it with: with no
                    // team declared, free input is better than an empty choice. The
                    // current value is always listed, even when outside the list.
                    const known =
                      field.optionsKey === undefined ? undefined : options?.[field.optionsKey];
                    const current = readPropAsString(row, field.prop);
                    const choices =
                      known === undefined || known.length === 0
                        ? undefined
                        : known.includes(current) || current === ""
                          ? known
                          : [current, ...known];
                    const state =
                      field.input !== "boolean"
                        ? undefined
                        : readBoolean(readPropAsString(row, field.prop));
                    // An editable boolean keeps its switch even when empty: the absence
                    // of a value means "no", and the switch is what allows setting it.
                    const isBoolean =
                      field.input === "boolean" && (state !== undefined || field.editable === true);
                    const checked = state === true;
                    return (
                      <div key={field.prop} className="group contents">
                        <dt className="text-ink-muted">{label}</dt>
                        <dd className="flex min-w-0 items-center gap-1 break-words">
                          {isBoolean ? (
                            <Switch
                              checked={checked}
                              label={label}
                              stateLabel={checked ? t("detail.yes") : t("detail.no")}
                              disabled={saving || !canEdit || field.editable !== true}
                              onChange={(next) => {
                                void toggleBoolean(field, next);
                              }}
                            />
                          ) : isEditing ? (
                            <>
                              {field.input === "boolean" ? (
                                <select
                                  autoFocus
                                  value={value}
                                  aria-label={label}
                                  disabled={saving}
                                  onChange={(event) => {
                                    setValue(event.target.value);
                                  }}
                                  onKeyDown={(event) => {
                                    onFieldKeyDown(event, field);
                                  }}
                                  className="h-7 min-w-0 flex-1 rounded-(--radius-control) border border-line bg-surface px-2"
                                >
                                  <option value="true">{t("detail.yes")}</option>
                                  <option value="false">{t("detail.no")}</option>
                                </select>
                              ) : choices !== undefined ? (
                                // The list filters as one types: a collector may count
                                // dozens of teams. Clearing the field clears the
                                // attribute, which the collector accepts.
                                <div
                                  className="min-w-0 flex-1"
                                  onKeyDown={(event) => {
                                    onFieldKeyDown(event, field);
                                  }}
                                >
                                  <Combobox
                                    options={choices.map((choice) => ({
                                      value: choice,
                                      label: choice,
                                    }))}
                                    value={value}
                                    onChange={setValue}
                                    label={label}
                                    placeholder={t("detail.searchValue")}
                                    emptyText={t("detail.noMatch")}
                                    inputRef={(node) => {
                                      node?.focus();
                                    }}
                                  />
                                </div>
                              ) : (
                                <input
                                  autoFocus
                                  type={
                                    field.input === "date"
                                      ? "date"
                                      : field.input === "number"
                                        ? "number"
                                        : "text"
                                  }
                                  value={value}
                                  aria-label={label}
                                  disabled={saving}
                                  onChange={(event) => {
                                    setValue(event.target.value);
                                  }}
                                  onKeyDown={(event) => {
                                    onFieldKeyDown(event, field);
                                  }}
                                  className="h-7 min-w-0 flex-1 rounded-(--radius-control) border border-line bg-surface px-2"
                                />
                              )}
                              <button
                                type="button"
                                disabled={saving}
                                title={t("detail.save")}
                                onClick={() => {
                                  void commit(field);
                                }}
                                className="text-ink-muted hover:text-ink disabled:opacity-60"
                              >
                                <CheckIcon />
                                <span className="sr-only">{t("detail.save")}</span>
                              </button>
                              <button
                                type="button"
                                title={t("detail.cancel")}
                                onClick={cancel}
                                className="text-ink-muted hover:text-ink"
                              >
                                <CloseIcon />
                                <span className="sr-only">{t("detail.cancel")}</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {/* A live update changing the value flashes it. The
                                  value takes its own width only, for the pencil to
                                  sit right after it rather than at the far end. */}
                              <FlashValue signature={shown ?? ""} className="min-w-0">
                                {shown === undefined || shown === "" ? (
                                  <span className="text-ink-muted">—</span>
                                ) : field.render !== undefined ? (
                                  field.render(row, locale)
                                ) : (
                                  shown
                                )}
                              </FlashValue>
                              {canEdit && field.editable === true && (
                                // Invisible at rest but present and focusable: the
                                // pencil stays reachable from the keyboard.
                                <button
                                  type="button"
                                  title={t("detail.editField", { field: label })}
                                  onClick={() => {
                                    startEditing(field);
                                  }}
                                  className="shrink-0 text-ink-muted opacity-0 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
                                >
                                  <PencilIcon />
                                  <span className="sr-only">
                                    {t("detail.editField", { field: label })}
                                  </span>
                                </button>
                              )}
                            </>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {footer !== undefined && <div className="mt-2">{footer}</div>}
              </section>
            );
          })}

          {saveError !== null && (
            <p role="alert" className="text-state-down">
              ■ {saveError}
            </p>
          )}

          {canEdit && editHint !== "" && (
            <p className="text-ink-muted">{editHint ?? t("detail.editHint")}</p>
          )}
        </div>
      )}

      {actions !== undefined && row !== null && row !== undefined && (
        <div className="mt-4 border-t border-line pt-3">{actions}</div>
      )}
    </>
  );
}

/**
 * Detail panel of a collector object: its properties in a side drawer.
 */
export function DetailPanel<T>({
  open,
  title,
  onClose,
  kind,
  isPending,
  before,
  after,
  recordId,
  ...content
}: DetailContentProps<T> & {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Object kind, to recall at the head of the panel where the row comes from. */
  kind: ObjectKind;
  /** Content placed before the properties, such as the object's tags. */
  before?: ReactNode;
  /** Content placed after the properties, such as the log of an action. */
  after?: ReactNode;
  /** Id of the object, for the bookmark button when a bookmark can reopen it. */
  recordId?: string;
}) {
  const { t } = useTranslation();
  const bookmarkable = recordId !== undefined && recordId !== "" && BOOKMARK_KINDS.has(kind);
  return (
    <SlideOver
      open={open}
      title={title}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      heading={<PanelTitle kind={kind} title={title} recordId={recordId} open={open} />}
      rail={<PanelHistoryRail currentKey={recordKey(kind, recordId)} />}
      actions={bookmarkable ? <BookmarkButton kind={kind} id={recordId} /> : undefined}
    >
      {/* Another record brings other values, which are not updates to flash. */}
      <FlashScope subject={`${kind}:${recordId ?? title}`}>
        {before}
        {/* A disabled query stays "pending": panel closed, nothing to load. */}
        <DetailContent {...content} isPending={open && isPending} />
        {after}
      </FlashScope>
    </SlideOver>
  );
}
