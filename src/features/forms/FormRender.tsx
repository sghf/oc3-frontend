import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGetDynamic } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { LegacyCssIcon } from "@/components/opensvc/LegacyCssIcon";
import { parseLegacyCss } from "@/components/opensvc/legacy-css";
import { Switch } from "@/components/ui/Switch";
import { Combobox } from "@/components/ui/Combobox";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";
import {
  candidatesPath,
  constraintHolds,
  convertBoolean,
  convertedValue,
  dependents,
  formData,
  groupData,
  initialValue,
  isEmptyValue,
  isRepeated,
  prepareArgs,
  restCandidates,
  substRefs,
  visibleInputs,
  type Candidate,
  type FormDefinition,
  type FormInput,
  type FormUser,
  type GroupState,
  type InputValue,
} from "./form-engine";
import { useFormDefinitionByName } from "./use-form";

const CONTROL =
  "h-8 w-full rounded-(--radius-control) border bg-surface px-2 text-ink disabled:bg-surface-sunken disabled:text-ink-muted";

/** A new group of inputs, each with its initial value; dynamic defaults resolved. */
function newGroup(def: FormDefinition, user: FormUser): GroupState {
  const values: Record<string, InputValue> = {};
  for (const input of def.inputs) values[input.id] = initialValue(input, user);
  const group: GroupState = { values, optionData: {} };
  // Simple inputs with a "#ref" default take it once the other values are set, as
  // the historical renderer does when it fires its initial change events.
  const data = groupData(def, group, visibleInputs(def, group));
  for (const input of def.inputs) {
    if (input.fn === "" && typeof input.default === "string" && input.default.includes("#")) {
      values[input.id] = substRefs(data, input.default);
    }
  }
  return group;
}

/** A stored value as the control of an input holds it. */
function controlValue(input: FormInput, v: unknown): InputValue {
  if (input.type === "form") return v;
  if (input.type === "boolean") return convertBoolean(v);
  if (input.multiple || input.type === "checklist")
    return Array.isArray(v)
      ? v.map((item) => controlValue({ ...input, multiple: false, type: "string" }, item))
      : [];
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * The groups of inputs holding a stored value, the inverse of formData(): one per
 * entry of a list or of a dict of dicts, one for a dict. An input the value does
 * not name keeps its initial value; a templated output cannot be read back and
 * starts from the defaults.
 */
function groupsFromData(def: FormDefinition, data: unknown, user: FormUser): GroupState[] {
  const output = def.output;
  if (output?.template) return [newGroup(def, user)];
  const record = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  let entries: unknown[];
  switch (output?.format) {
    case "list":
    case "list of dict":
      entries = Array.isArray(data) ? data : [];
      break;
    case "dict of dict":
      entries = record(data)
        ? Object.entries(data).map(([key, entry]) => ({
            ...(record(entry) ? entry : {}),
            [output.key]: key,
          }))
        : [];
      break;
    default:
      entries = [data];
  }
  if (entries.length === 0) return isRepeated(def) ? [] : [newGroup(def, user)];
  return entries.map((entry) => {
    const group = newGroup(def, user);
    if (record(entry)) {
      for (const input of def.inputs) {
        if (input.key in entry) group.values[input.id] = controlValue(input, entry[input.key]);
      }
    } else {
      // A plain entry, as a list of strings stores it, fills the first shown input.
      const first = def.inputs.find((input) => !input.hidden);
      if (first !== undefined) group.values[first.id] = controlValue(first, entry);
    }
    return group;
  });
}

/**
 * The size of a control: its Width, else the form's, and the form's MinWidth, as
 * the historical renderer sets them; never wider than its column.
 */
function controlStyle(def: FormDefinition, input: FormInput): CSSProperties | undefined {
  const width = input.width ?? def.width;
  if (width === undefined && def.minWidth === undefined) return undefined;
  return { width, minWidth: def.minWidth, maxWidth: "100%" };
}

/** The problems of an input that disable the submission. */
function violationsOf(
  input: FormInput,
  value: InputValue,
  data: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  if (
    input.mandatory &&
    !["checklist", "form", "boolean"].includes(input.type) &&
    isEmptyValue(value) &&
    value !== 0
  ) {
    out.push("mandatory");
  }
  if (!constraintHolds(input, convertedValue(input, value), data)) out.push("constraint");
  return out;
}

/**
 * A form as its users see it: its inputs, their candidates fetched from the API,
 * the conditions that show or hide them, the mandatory and constraint checks
 * that hold the submission, and repeated groups for the list outputs.
 *
 * `onSubmit` receives the data a submission would send, shaped by the first
 * output; the caller decides what to do with it. `onDataChange` reports it on
 * every change, for a sub-form.
 */
export function FormRender({
  def,
  user,
  onSubmit,
  onDataChange,
  submitLabel,
  initialData,
  stickySubmit = false,
  secondaryAction,
}: {
  def: FormDefinition;
  user: FormUser;
  /** A stored value to start from, instead of the form's defaults. */
  initialData?: unknown;
  onSubmit?: (data: unknown) => void;
  onDataChange?: (data: unknown) => void;
  submitLabel?: string;
  /**
   * Keeps the submit button at the bottom of the screen while a long form
   * scrolls: it is never out of reach.
   */
  stickySubmit?: boolean;
  /** Placed before the submit button, a cancel for instance. */
  secondaryAction?: ReactNode;
}) {
  const { t } = useTranslation();
  const repeated = isRepeated(def);
  const minEntries = def.output?.minEntries ?? 0;
  const maxEntries = def.output?.maxEntries ?? null;
  const [groups, setGroups] = useState<GroupState[]>(() =>
    initialData === undefined ? [newGroup(def, user)] : groupsFromData(def, initialData, user),
  );
  const deps = useMemo(() => dependents(def), [def]);

  const visible = groups.map((group) => visibleInputs(def, group));
  const datas = groups.map((group, i) => groupData(def, group, visible[i] ?? new Set()));
  const violations = groups.flatMap((group, i) =>
    def.inputs
      .filter((input) => visible[i]?.has(input.id))
      .flatMap((input) => violationsOf(input, group.values[input.id], datas[i] ?? {})),
  );
  const data = formData(def, datas);
  const dataKey = JSON.stringify(data);

  // The data is reported when it changes, not when the callback does: a parent
  // passes a new one on each render, and its state update would loop.
  const report = useRef(onDataChange);
  useEffect(() => {
    report.current = onDataChange;
  }, [onDataChange]);
  useEffect(() => {
    report.current?.(JSON.parse(dataKey) as unknown);
  }, [dataKey]);

  /** Sets a value, and resets the inputs depending on it, as the fn triggers do. */
  function change(index: number, id: string, value: InputValue, optionData?: unknown) {
    setGroups((previous) =>
      previous.map((group, i) => {
        if (i !== index) return group;
        const next: GroupState = {
          values: { ...group.values, [id]: value },
          optionData: { ...group.optionData, [id]: optionData },
        };
        const nextData = groupData(def, next, visibleInputs(def, next));
        for (const dependent of deps.get(id) ?? []) {
          if (dependent.fn === "" && typeof dependent.default === "string") {
            next.values[dependent.id] = substRefs(nextData, dependent.default);
          } else if (dependent.fn !== "") {
            next.values[dependent.id] =
              dependent.multiple || dependent.type === "checklist" ? [] : "";
            delete next.optionData[dependent.id];
          }
        }
        return next;
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, index) => (
        <div
          key={index}
          className={repeated ? "rounded-(--radius-panel) border border-line p-3" : undefined}
        >
          {repeated && groups.length > minEntries && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setGroups((previous) => previous.filter((_, i) => i !== index));
                }}
                className="flex h-7 items-center gap-1 rounded-(--radius-control) border border-line px-2 text-ink-muted hover:text-ink"
              >
                <CloseIcon className="h-3.5 w-3.5" />
                {t("forms.render.removeGroup")}
              </button>
            </div>
          )}
          <div
            className={
              def.vertical
                ? "flex flex-col gap-3"
                : "grid grid-cols-[minmax(8rem,max-content)_1fr] items-start gap-x-4 gap-y-3"
            }
          >
            {def.inputs
              .filter((input) => visible[index]?.has(input.id))
              .map((input) => (
                <InputRow
                  key={input.id}
                  input={input}
                  group={group}
                  data={datas[index] ?? {}}
                  user={user}
                  vertical={def.vertical}
                  style={controlStyle(def, input)}
                  onChange={(value, optionData) => {
                    change(index, input.id, value, optionData);
                  }}
                />
              ))}
          </div>
        </div>
      ))}

      {repeated && (maxEntries === null || groups.length < maxEntries) && (
        <div>
          <button
            type="button"
            onClick={() => {
              setGroups((previous) => [...previous, newGroup(def, user)]);
            }}
            className="flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
          >
            <PlusIcon />
            {t("forms.render.addGroup")}
          </button>
        </div>
      )}

      {onSubmit !== undefined && (
        <div
          className={
            stickySubmit
              ? "sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 rounded-b-(--radius-panel) border-t border-line bg-surface-raised px-4 py-3"
              : // A cancel beside the submit button keeps its distance.
                "flex flex-wrap items-center gap-2"
          }
        >
          {violations.length > 0 && stickySubmit && (
            <p role="status" className="mr-auto text-state-down">
              ■ {t("forms.render.violations", { count: violations.length })}
            </p>
          )}
          {secondaryAction}
          <button
            type="button"
            disabled={violations.length > 0}
            onClick={() => {
              onSubmit(data);
            }}
            className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {submitLabel ?? t("forms.render.submit")}
          </button>
          {violations.length > 0 && !stickySubmit && (
            <p role="status" className="basis-full text-state-down">
              ■ {t("forms.render.violations", { count: violations.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One input: its label, its control, its help, and its problems. */
function InputRow({
  input,
  group,
  data,
  user,
  vertical,
  style,
  onChange,
}: {
  input: FormInput;
  group: GroupState;
  data: Record<string, unknown>;
  user: FormUser;
  vertical: boolean;
  style: CSSProperties | undefined;
  onChange: (value: InputValue, optionData?: unknown) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const value = group.values[input.id];
  const problems = violationsOf(input, value, data);
  const describedBy = `${id}-help`;
  return (
    <>
      <label htmlFor={id} className={`font-medium text-ink ${vertical ? "" : "pt-1.5"}`}>
        {/* LabelCss: the icon the historical renderer puts before the label. */}
        <LegacyCssIcon css={input.labelCss} className="mr-1.5 inline h-4 w-4 align-[-2px]" />
        {input.label}
        {input.mandatory && (
          <span className="text-state-down" title={t("forms.render.mandatory")}>
            {" "}
            *<span className="sr-only">{t("forms.render.mandatory")}</span>
          </span>
        )}
      </label>
      <div className="min-w-0">
        <InputControl
          id={id}
          input={input}
          value={value}
          data={data}
          user={user}
          invalid={problems.length > 0}
          describedBy={describedBy}
          style={style}
          onChange={onChange}
        />
        <div id={describedBy}>
          {problems.includes("mandatory") && (
            <p className="mt-1 text-state-down">■ {t("forms.render.required")}</p>
          )}
          {problems.includes("constraint") && (
            <p className="mt-1 text-state-down">
              ■ {t("forms.render.constraint", { constraint: input.constraint })}
            </p>
          )}
          {input.help !== "" && <p className="mt-1 text-ink-muted">{input.help}</p>}
        </div>
      </div>
    </>
  );
}

/** Candidates fetched from the API for an input, once its references resolve. */
function useRestCandidates(
  input: FormInput,
  data: Record<string, unknown>,
  user: FormUser,
  enabled: boolean,
) {
  const path = candidatesPath(input, data, user);
  const args = prepareArgs(input.args, data, user);
  const query = Object.fromEntries(
    Object.entries(args).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : true)),
  );
  return useQuery({
    queryKey: ["form-candidates", path, query],
    enabled: enabled && path !== null,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Candidate[]> => {
      const response = await apiGetDynamic(path ?? "", query);
      if (response.status >= 300) throw new Error(problemText(response.body));
      const body = response.body;
      const rows =
        typeof body === "object" && body !== null && "data" in body && Array.isArray(body.data)
          ? (body.data as unknown[])
          : [];
      return restCandidates(input, rows, args);
    },
  });
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asString) : [];
}

/** The control of an input, according to its type and its candidates. */
function InputControl({
  id,
  input,
  value,
  data,
  user,
  invalid,
  describedBy,
  style,
  onChange,
}: {
  id: string;
  input: FormInput;
  value: InputValue;
  data: Record<string, unknown>;
  user: FormUser;
  invalid: boolean;
  describedBy: string;
  style: CSSProperties | undefined;
  onChange: (value: InputValue, optionData?: unknown) => void;
}) {
  const { t } = useTranslation();
  const border = invalid ? "border-state-down" : "border-line";
  // Css of an input: the historical renderer styles the value with it (an icon,
  // or `pre` for preformatted text); `pre` also sets the typing of a text field.
  const mono = parseLegacyCss(input.css).pre ? "font-mono text-data" : "";
  const common = {
    id,
    style,
    disabled: input.readOnly,
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
  };
  const rest = useRestCandidates(input, data, user, input.fn !== "");

  // Candidates fetched: the first one is chosen when nothing is, unless disabled.
  const candidates = rest.data;
  const needsDefault =
    input.fn !== "" &&
    !input.disableAutoDefault &&
    !input.multiple &&
    input.type !== "checklist" &&
    input.type !== "info" &&
    input.type !== "text" &&
    isEmptyValue(value);
  const first = candidates?.[0];
  const choose = useRef(onChange);
  useEffect(() => {
    choose.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (needsDefault && first !== undefined && first.id !== "")
      choose.current(first.id, first.data);
  }, [needsDefault, first]);

  // An info or text input fed by the API holds the text it shows, as the
  // historical renderer reads it back from the element.
  const fedText =
    input.fn !== "" && (input.type === "info" || input.type === "text") && candidates !== undefined
      ? candidates.map((c) => c.text).join("\n")
      : null;
  useEffect(() => {
    if (fedText !== null) choose.current(fedText);
  }, [fedText]);

  const candidateStatus: ReactNode =
    input.fn === "" ? null : rest.isError ? (
      <p className="mt-1 text-state-down">
        ■ {t("forms.render.candidatesError", { message: rest.error.message })}
      </p>
    ) : rest.isFetching ? (
      <p className="mt-1 text-ink-muted">{t("forms.render.candidatesLoading")}</p>
    ) : candidatesPath(input, data, user) === null ? (
      <p className="mt-1 text-ink-muted">{t("forms.render.candidatesWaiting")}</p>
    ) : null;

  switch (input.type) {
    case "boolean":
      return (
        <Switch
          checked={value === true}
          label={input.label}
          stateLabel={value === true ? t("forms.render.yes") : t("forms.render.no")}
          disabled={input.readOnly}
          onChange={(checked) => {
            onChange(checked);
          }}
        />
      );
    case "info": {
      const text =
        input.fn !== "" ? (candidates ?? []).map((c) => c.text).join("\n") : asString(value);
      return (
        <div id={id} className={`flex gap-1.5 py-1.5 text-ink ${mono}`}>
          {text !== "" && <LegacyCssIcon css={input.css} className="mt-0.5 h-4 w-4" />}
          <div className="min-w-0 break-words whitespace-pre-wrap">
            {text}
            {candidateStatus}
          </div>
        </div>
      );
    }
    case "text":
      return (
        <>
          <textarea
            {...common}
            value={
              input.fn !== "" && isEmptyValue(value)
                ? (candidates ?? []).map((c) => c.text).join("\n")
                : asString(value)
            }
            onChange={(event) => {
              onChange(event.target.value);
            }}
            rows={6}
            className={`w-full rounded-(--radius-control) border ${border} bg-surface p-2 font-mono text-data text-ink`}
          />
          {candidateStatus}
        </>
      );
    case "date":
    case "time":
      return (
        <input
          {...common}
          type={input.type}
          value={asString(value)}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={`${CONTROL} ${border}`}
        />
      );
    case "datetime":
      // Stored as "YYYY-MM-DD HH:MM", as the historical date-time picker writes it.
      return (
        <input
          {...common}
          type="datetime-local"
          value={asString(value).replace(" ", "T")}
          onChange={(event) => {
            onChange(event.target.value.replace("T", " "));
          }}
          className={`${CONTROL} ${border}`}
        />
      );
    case "checklist": {
      const options: Candidate[] =
        input.candidates !== null
          ? input.candidates.map((c) => ({ id: c.value, text: c.label }))
          : (candidates ?? []);
      return (
        <Checklist
          id={id}
          input={input}
          options={options}
          value={asStrings(value)}
          onChange={onChange}
          status={candidateStatus}
        />
      );
    }
    case "form":
      return <SubFormInput name={input.subForm} user={user} onChange={onChange} />;
  }

  // Candidates, static or fetched: a selection list, whether StrictCandidates is
  // set or not, as the select2 list of the historical renderer. A single choice is
  // filtered by typing, as select2 searched: a list of nodes runs to hundreds.
  if (input.candidates !== null || input.fn !== "") {
    const options: Candidate[] =
      input.candidates !== null
        ? input.candidates.map((c) => ({ id: c.value, text: c.label }))
        : (candidates ?? []);
    const pick = (ids: string[]) => {
      const rows = ids.map((v) => options.find((o) => o.id === v)?.data);
      if (input.multiple) onChange(ids, rows);
      else onChange(ids[0] ?? "", rows[0]);
    };
    const selected = input.multiple ? asStrings(value) : [asString(value)];
    // A value outside the candidates, from a default, still shows.
    const extra = selected.filter((v) => v !== "" && !options.some((o) => o.id === v));
    if (!input.multiple)
      return (
        <>
          <Combobox
            id={id}
            style={style}
            disabled={input.readOnly}
            invalid={invalid}
            describedBy={describedBy}
            label={input.label}
            options={[
              ...extra.map((v) => ({ value: v, label: v })),
              ...options.map((o) => ({ value: o.id, label: o.text })),
            ]}
            value={selected[0] ?? ""}
            onChange={(v) => {
              pick(v === "" ? [] : [v]);
            }}
            placeholder={input.placeholder || t("forms.render.selectCandidate")}
            emptyText={t("forms.render.noCandidateMatch")}
            inputClassName="h-8"
          />
          {candidateStatus}
        </>
      );
    return (
      <>
        <select
          {...common}
          multiple={input.multiple}
          value={input.multiple ? selected : (selected[0] ?? "")}
          onChange={(event) => {
            pick([...event.target.selectedOptions].map((o) => o.value));
          }}
          className={`w-full rounded-(--radius-control) border ${border} bg-surface px-2 text-ink ${input.multiple ? "min-h-24 py-1" : "h-8"}`}
        >
          {!input.multiple && (input.disableAutoDefault || selected[0] === "") && (
            <option value="">{input.placeholder || t("forms.render.selectCandidate")}</option>
          )}
          {extra.map((v) => (
            <option key={`extra-${v}`} value={v}>
              {v}
            </option>
          ))}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.text}
            </option>
          ))}
        </select>
        {candidateStatus}
      </>
    );
  }

  return (
    <input
      {...common}
      type={input.type === "password" ? "password" : "text"}
      value={asString(value)}
      placeholder={input.placeholder}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className={`${CONTROL} ${border} ${mono}`}
    />
  );
}

/** A list of checkboxes, with a toggle of them all, as the historical checklist. */
function Checklist({
  id,
  input,
  options,
  value,
  onChange,
  status,
}: {
  id: string;
  input: FormInput;
  options: Candidate[];
  value: string[];
  onChange: (value: InputValue, optionData?: unknown) => void;
  status: ReactNode;
}) {
  const { t } = useTranslation();
  // Everything ticked on load when asked, as long as nothing was chosen.
  const [touched, setTouched] = useState(false);
  const effective =
    !touched && input.checkOnLoadAll && value.length === 0 ? options.map((o) => o.id) : value;
  const set = (next: string[]) => {
    setTouched(true);
    onChange(next);
  };
  if (options.length === 0) return <div id={id}>{status}</div>;
  const all = options.every((o) => effective.includes(o.id));
  return (
    <fieldset id={id} className="flex flex-col gap-1 py-1">
      <legend className="sr-only">{input.label}</legend>
      <label className="flex items-center gap-2 text-ink-muted">
        <input
          type="checkbox"
          checked={all}
          disabled={input.readOnly}
          onChange={() => {
            set(all ? [] : options.map((o) => o.id));
          }}
        />
        {t("forms.render.toggleAll")}
      </label>
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-ink">
          <input
            type="checkbox"
            checked={effective.includes(o.id)}
            disabled={input.readOnly}
            onChange={(event) => {
              set(
                event.target.checked ? [...effective, o.id] : effective.filter((v) => v !== o.id),
              );
            }}
          />
          {o.text}
        </label>
      ))}
      {status}
    </fieldset>
  );
}

/** A form embedded in another, found by name; its data is the input value. */
function SubFormInput({
  name,
  user,
  onChange,
}: {
  name: string;
  user: FormUser;
  onChange: (value: InputValue) => void;
}) {
  const { t } = useTranslation();
  const sub = useFormDefinitionByName(name);
  const def = sub.data ?? null;
  if (name === "") return <p className="text-state-down">■ {t("forms.render.subFormMissing")}</p>;
  if (sub.isPending) return <p className="text-ink-muted">{t("forms.render.candidatesLoading")}</p>;
  if (sub.isError) return <p className="text-state-down">■ {sub.error.message}</p>;
  if (def === null)
    return <p className="text-state-down">■ {t("forms.render.subFormNotFound", { name })}</p>;
  return (
    <div className="rounded-(--radius-panel) border border-line p-3">
      <FormRender def={def} user={user} onDataChange={onChange} />
    </div>
  );
}
