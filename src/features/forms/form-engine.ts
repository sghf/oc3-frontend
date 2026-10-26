/**
 * Rendering rules of the collector forms, ported from the historical renderer
 * (`init/static/js/osvc/forms.js`) with its semantics, quirks included: a form
 * definition is a YAML document whose Inputs describe what the user fills, and
 * whose first Output tells the shape of the data a submission sends.
 */

/** A value held by an input: text, a list of ids, a yes/no, or a sub-form's data. */
export type InputValue = unknown;

/** Definition of one input, read defensively from the parsed YAML. */
export interface FormInput {
  id: string;
  /** Name of the value in the submitted data: Key, else Id. */
  key: string;
  label: string;
  type: string;
  help: string;
  hidden: boolean;
  readOnly: boolean;
  mandatory: boolean;
  multiple: boolean;
  strictCandidates: boolean;
  disableAutoDefault: boolean;
  checkOnLoadAll: boolean;
  placeholder: string;
  default: unknown;
  /** Static candidates, as { value, label }. */
  candidates: { value: string; label: string }[] | null;
  /** Rest path of the dynamic candidates, "#key" references included. */
  fn: string;
  /** Whether a Function key is present, even empty: it enables dynamic defaults. */
  hasFunctionKey: boolean;
  args: string[];
  /** Property naming a candidate's id, "#prop". */
  value: string;
  /** Label of a candidate, "#prop" references to its properties. */
  format: string;
  keys: string[];
  condition: string | string[] | null;
  constraint: string;
  unit: string;
  /** Name of the form of a "form" type input. */
  subForm: string;
  /** Legacy classes of the label (an icon) and of the value (an icon, `pre`). */
  labelCss: string;
  css: string;
  /** Width of the control, a CSS length; the form's Width when unset. */
  width: string | undefined;
  /** Label in display mode, when it differs from the form's. */
  displayModeLabel: string;
  /** False when the input has no column in the digest of a displayed value. */
  displayInDigest: boolean;
  /** Length beyond which a displayed value is shortened, 0 for never. */
  displayModeTrim: number;
}

export interface FormOutputShape {
  format: string;
  template: string;
  /** Key naming the entries of a "dict of dict" output. */
  key: string;
  embedKey: boolean;
  minEntries: number;
  maxEntries: number | null;
}

export interface FormDefinition {
  label: string;
  desc: string;
  /** Legacy classes of the form: the icon of its card and of its title. */
  css: string;
  /** Default width and minimum width of the controls, CSS lengths. */
  width: string | undefined;
  minWidth: string | undefined;
  vertical: boolean;
  inputs: FormInput[];
  output: FormOutputShape | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return typeof v === "string"
    ? v
    : typeof v === "number" || typeof v === "boolean"
      ? String(v)
      : "";
}

/**
 * A YAML boolean as the historical collector read the forms, with PyYAML (YAML
 * 1.1): yes, true and on, in any case. The YAML 1.2 parser of the SPA leaves
 * "Yes" or "On" as strings, which would silently drop `ReadOnly: Yes` or
 * `Mandatory: Yes`.
 */
function bool(v: unknown): boolean {
  return v === true || (typeof v === "string" && /^(yes|true|on)$/i.test(v));
}

/**
 * A Width or MinWidth: a number of pixels, as jQuery's width() reads it, or a
 * CSS length. Anything else is dropped rather than written into a style.
 */
export function cssLength(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return `${String(v)}px`;
  if (typeof v !== "string") return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(px|em|rem|%|ch|ex|vw|vh)?\s*$/.exec(v);
  if (m === null) return undefined;
  return `${m[1] ?? ""}${m[2] ?? "px"}`;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter((s) => s !== "") : [];
}

/** Reads a form definition, as the API returns it parsed; null when unusable. */
export function parseDefinition(raw: unknown): FormDefinition | null {
  if (!isRecord(raw)) return null;
  const inputs: FormInput[] = [];
  for (const item of Array.isArray(raw.Inputs) ? raw.Inputs : []) {
    if (!isRecord(item)) continue;
    const id = str(item.Id);
    if (id === "") continue;
    let candidates: FormInput["candidates"] = null;
    let fn = str(item.Function);
    let args = strList(item.Args);
    let def: unknown = item.Default;
    // The selectors the historical renderer turns into rest candidates.
    if (item.Candidates === "__node_selector__") {
      fn = "/users/self/nodes";
      args = ["props = nodename", "meta = 0", "limit = 0"];
    } else if (item.Candidates === "__service_selector__") {
      fn = "/users/self/services";
      args = ["props = svcname", "meta = 0", "limit = 0"];
    } else if (Array.isArray(item.Candidates)) {
      candidates = item.Candidates.flatMap((c) => {
        if (typeof c === "string" || typeof c === "number")
          return [{ value: String(c), label: String(c) }];
        if (isRecord(c) && "Value" in c && "Label" in c)
          return [{ value: str(c.Value), label: str(c.Label) }];
        return [];
      });
    }
    if (def === "__user_primary_group__") {
      fn = "/users/self/primary_group";
      args = ["props = role"];
      def = undefined;
    }
    inputs.push({
      id,
      key: str(item.Key) || id,
      label: str(item.Label) || id,
      type: str(item.Type) || "string",
      help: str(item.Help),
      hidden: bool(item.Hidden),
      readOnly: bool(item.ReadOnly),
      mandatory: bool(item.Mandatory),
      multiple: bool(item.Multiple),
      strictCandidates: bool(item.StrictCandidates),
      disableAutoDefault: bool(item.DisableAutoDefault),
      checkOnLoadAll: item.CheckOnLoad === "all",
      placeholder: str(item.Placeholder),
      default: def,
      candidates,
      fn,
      hasFunctionKey: "Function" in item,
      args,
      value: str(item.Value),
      format: str(item.Format),
      keys: strList(item.Keys),
      condition:
        typeof item.Condition === "string"
          ? item.Condition
          : Array.isArray(item.Condition)
            ? strList(item.Condition)
            : null,
      constraint: str(item.Constraint),
      unit: str(item.Unit),
      subForm: str(item.Form),
      labelCss: str(item.LabelCss),
      css: str(item.Css),
      width: cssLength(item.Width),
      displayModeLabel: str(item.DisplayModeLabel),
      // The historical renderer tests `DisplayInDigest == false`, which only a false,
      // 0, "0" or empty value satisfies: null or an absent key keeps the column.
      displayInDigest: !(
        item.DisplayInDigest === false ||
        item.DisplayInDigest === 0 ||
        item.DisplayInDigest === "0" ||
        item.DisplayInDigest === ""
      ),
      displayModeTrim:
        typeof item.DisplayModeTrim === "number" && item.DisplayModeTrim > 0
          ? item.DisplayModeTrim
          : 0,
    });
  }
  const outputs = Array.isArray(raw.Outputs) ? raw.Outputs : null;
  const first: unknown = outputs?.[0];
  const output: FormOutputShape | null =
    outputs === null
      ? null
      : {
          format: isRecord(first) ? str(first.Format) || "dict" : "dict",
          template: isRecord(first) ? str(first.Template) : "",
          key: isRecord(first) ? str(first.Key) : "",
          embedKey: isRecord(first) ? bool(first.EmbedKey) : false,
          minEntries:
            isRecord(first) && typeof first.MinEntries === "number" ? first.MinEntries : 0,
          maxEntries:
            isRecord(first) && typeof first.MaxEntries === "number" ? first.MaxEntries : null,
        };
  return {
    label: str(raw.Label),
    desc: str(raw.Desc),
    css: str(raw.Css),
    width: cssLength(raw.Width),
    minWidth: cssLength(raw.MinWidth),
    vertical: bool(raw.Vertical),
    inputs,
    output,
  };
}

/** Whether the output format repeats groups of inputs. */
export function isRepeated(def: FormDefinition): boolean {
  const format = def.output?.format ?? "dict";
  return format === "list" || format === "list of dict" || format === "dict of dict";
}

/** The current user, for the __user_*__ defaults and the #user_id references. */
export interface FormUser {
  id: string;
  name: string;
  email: string;
  phoneWork: string;
}

/** Initial value of an input, as render_form_group() picks its content. */
export function initialValue(input: FormInput, user: FormUser): InputValue {
  const d = input.default;
  if (d === "__user_email__") return user.email;
  if (d === "__user_name__") return user.name;
  if (d === "__user_phone_work__") return user.phoneWork;
  if (input.type === "boolean") return convertBoolean(d);
  if (input.type === "checklist") return Array.isArray(d) ? d.map(str) : [];
  if (input.type === "form") return undefined;
  if (input.multiple)
    return Array.isArray(d)
      ? d.map(str)
      : d === undefined || d === null || d === ""
        ? []
        : [str(d)];
  if (d === undefined || d === null || d === "") {
    // A list without default starts on its first candidate, as a select shows it,
    // unless DisableAutoDefault asks for an empty choice.
    const first = input.candidates?.[0];
    return first !== undefined && !input.disableAutoDefault ? first.value : "";
  }
  return str(d);
}

/** Whether a value is empty, as the historical `val != ""` tests judge it. */
export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "" || v === false || v === 0) return true;
  return Array.isArray(v) && v.length === 0;
}

/**
 * Replaces the "#key" or "#a.b" references of s by the values of data, as
 * subst_refs_from_data() does: a reference without a scalar value stays.
 */
export function substRefs(data: unknown, s: string): string {
  return s.replace(REF, (ref) => refValue(data, ref) ?? ref);
}

/** A "#key" or "#a.b" reference to the data of a form. */
const REF = /#[\w.]+/g;

/** The value of a reference in data, as substRefs reads it; undefined without a scalar one. */
function refValue(data: unknown, ref: string): string | undefined {
  if (!isRecord(data)) return undefined;
  const path = ref.slice(1);
  // oc3 returns the columns of a joined table under flat keys, "stor_array.id",
  // where the historical API nested them: the whole reference first, then its
  // path, a trailing dot left as text.
  const flat = path.replace(/\.$/, "");
  const direct = data[flat];
  if (typeof direct === "string" || typeof direct === "number" || typeof direct === "boolean")
    return String(direct) + (flat === path ? "" : ".");
  let finalDot = "";
  let val: unknown = data;
  for (const key of path.split(".")) {
    if (key === "") {
      finalDot = ".";
      break;
    }
    if (isRecord(val) && key in val) val = val[key];
  }
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return String(val) + finalDot;
  }
  return undefined;
}

/**
 * Query arguments of a rest candidates call, "key = value" entries with their
 * references replaced, as prepare_args() does; a repeated key makes a list.
 */
export function prepareArgs(
  args: string[],
  data: unknown,
  user: FormUser,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const entry of args) {
    const idx = entry.indexOf("=");
    if (idx < 0) continue;
    const key = entry.slice(0, idx).replace(/\s+/g, "");
    const val = substRefs(
      data,
      entry
        .slice(idx + 1)
        .replace(/^\s+/, "")
        .replaceAll("#user_id", user.id),
    );
    const prev = out[key];
    out[key] = prev === undefined ? val : Array.isArray(prev) ? [...prev, val] : [prev, val];
  }
  return out;
}

/**
 * The rest path of dynamic candidates, references replaced; null while data is
 * missing to build it, as getUrlFunc() cancels the call.
 *
 * A value replacing a reference is data, a user's answer say: it is encoded as
 * the text of one path segment (encodeURIComponent), so that a "/", "?" or "%"
 * in it cannot change the endpoint called or add a query; a value holding a "#"
 * makes the path wait, as an unresolved reference does. The path is refused,
 * null, when a segment ends up empty, is a dot segment (".." or "%2e%2e", which
 * the URL parser resolves alike), or holds a question mark or a backslash written
 * in the form itself: the call stays on the endpoint the form names.
 */
export function candidatesPath(input: FormInput, data: unknown, user: FormUser): string | null {
  const fn = input.fn.trim();
  if (!fn.startsWith("/")) return null;
  const segments = fn
    .slice(1)
    .split("/")
    .map((segment) =>
      segment.replaceAll("#user_id", encodeURIComponent(user.id)).replace(REF, (ref) => {
        const value = refValue(data, ref);
        // A value holding a "#" is a reference not resolved yet, the text of an
        // empty input say: the path waits, as getUrlFunc() waits on a "#".
        return value === undefined || value.includes("#") ? ref : encodeURIComponent(value);
      }),
    );
  for (const segment of segments) {
    // A reference left unresolved: the data to build the path is missing yet.
    if (segment.includes("#")) return null;
    if (segment === "" || segment === "undefined") return null;
    if (/^(?:\.|%2e){1,2}$/i.test(segment) || /[?\\]/.test(segment)) return null;
  }
  return `/${segments.join("/")}`;
}

/** A candidate of a select: its id, its label, and the row it comes from. */
export interface Candidate {
  id: string;
  text: string;
  data?: unknown;
}

/** Candidates of a rest answer, id and label read as getProcessResultFunc() does. */
/**
 * A candidate row in the shape the historical API gave it, which the forms are
 * written against. oc3 returns the columns of joined tables under flat keys,
 * "stor_array.id"; the historical API returned pydal's as_list(): a row nested
 * by table when the columns came from several tables, `{stor_array: {id}}`, and
 * plain columns when they came from a single one, `{id}`. A form then reads
 * `#id`, or `#stor_array.id`, whose missing segment substRefs skips.
 */
export function legacyRowShape(row: Record<string, unknown>): Record<string, unknown> {
  const tables: Record<string, Record<string, unknown>> = {};
  const plain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const dot = key.indexOf(".");
    if (dot <= 0) {
      plain[key] = value;
      continue;
    }
    const table = key.slice(0, dot);
    (tables[table] ??= {})[key.slice(dot + 1)] = value;
  }
  const names = Object.keys(tables);
  if (names.length === 0) return row;
  const only = names.length === 1 ? tables[names[0] ?? ""] : undefined;
  if (only !== undefined && Object.keys(plain).length === 0) return only;
  return { ...plain, ...tables };
}

export function restCandidates(
  input: FormInput,
  rows: unknown[],
  args: Record<string, string | string[]>,
): Candidate[] {
  let idProp = input.value;
  if (idProp === "") {
    const props = args.props;
    idProp = typeof props === "string" ? (props.split(",")[0] ?? "") : input.key;
  }
  idProp = idProp.replace("#", "");
  return rows.map((raw) => {
    if (typeof raw === "string" || typeof raw === "number")
      return { id: String(raw), text: String(raw) };
    const row = isRecord(raw) ? legacyRowShape(raw) : raw;
    const id = substRefs(row, `#${idProp}`);
    return { id, text: input.format === "" ? id : substRefs(row, input.format), data: row };
  });
}

// --- Conditions and constraints -------------------------------------------------

interface ParsedCondition {
  id: string;
  op: string;
  ref: string;
}

function parseCondition(cond: string): ParsedCondition | null {
  const op = ["!=", "==", "NOT IN", "IN", ">", "<"].find((candidate) => cond.includes(candidate));
  if (op === undefined) return null;
  const [id = "", ref = ""] = cond.split(op);
  return { id: id.trim().replace(/^#/, ""), op, ref: ref.trim() };
}

/** Loose comparison, as the javascript operators the historical renderer uses. */
function compare(val: unknown, ref: unknown, op: string): boolean {
  const a = typeof val === "number" || typeof ref === "number" ? Number(val) : val;
  const b = typeof val === "number" || typeof ref === "number" ? Number(ref) : ref;
  if (typeof a !== "number" && typeof a !== "string" && typeof a !== "boolean") return false;
  if (typeof b !== "number" && typeof b !== "string" && typeof b !== "boolean") return false;
  switch (op) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
  }
  return String(a) === String(b);
}

function evalCondition(c: ParsedCondition, data: Record<string, unknown>): boolean {
  const val = data[c.id];
  let ref: string | number | boolean = c.ref;
  if (typeof val === "number") {
    const n = parseInt(c.ref, 10);
    if (!Number.isNaN(n)) ref = n;
  } else if (typeof val === "boolean") {
    ref = c.ref.toLowerCase() === "true";
  }
  if (!isEmptyValue(val) || typeof val === "number") {
    switch (c.op) {
      case "!=":
        return ref === "empty" ? true : !compare(val, ref, "==");
      case "==":
        return ref === "empty" ? false : compare(val, ref, "==");
      case "NOT IN":
        return !c.ref.split(",").includes(String(val));
      case "IN":
        return c.ref.split(",").includes(String(val));
      case ">":
      case "<":
        return ref === "empty" ? false : compare(val, ref, c.op);
    }
    return false;
  }
  if (c.op === "!=") return ref !== "empty";
  if (c.op === "==") return ref === "empty";
  return false;
}

/** Whether an input shows for the data, as eval_conditions() decides. */
export function conditionsHold(input: FormInput, data: Record<string, unknown>): boolean {
  if (input.condition === null || input.condition === "") return true;
  const list = typeof input.condition === "string" ? [input.condition] : input.condition;
  if (list.length === 0) return true;
  return list.every((cond) => {
    const c = parseCondition(cond);
    return c === null ? false : evalCondition(c, data);
  });
}

/** Whether a value satisfies the input constraint, as eval_constraint() decides. */
export function constraintHolds(
  input: FormInput,
  val: unknown,
  data: Record<string, unknown>,
): boolean {
  if (input.constraint === "" || input.type === "checklist") return true;
  if (isEmptyValue(val) && typeof val !== "number" && !input.mandatory) return true;
  let op = "match";
  let refText = input.constraint;
  for (const candidate of [">=", "<=", ">", "<", "=="]) {
    if (input.constraint.startsWith(candidate)) {
      op = candidate;
      refText = input.constraint.slice(candidate.length);
      break;
    }
  }
  if (op === "match" && /^match\s+/.test(refText)) refText = refText.replace(/^match\s+/, "");
  refText = substRefs(data, refText.trim());
  if (val === undefined) return false;
  let ref: string | number | boolean = refText;
  if (typeof val === "number") {
    if (op !== "match") {
      const n = parseInt(refText, 10);
      if (!Number.isNaN(n)) ref = n;
    }
  } else if (typeof val === "boolean") {
    ref = refText.toLowerCase() === "true";
  } else if (typeof val === "string" && op !== "match") {
    return false;
  }
  if (!isEmptyValue(val) || typeof val === "number") {
    if (ref === "empty") return false;
    if (op === "match") {
      try {
        return new RegExp(String(ref)).exec(String(val)) !== null;
      } catch {
        return false;
      }
    }
    return compare(val, ref, op);
  }
  return op === "==" && ref === "empty";
}

// --- Values and data -----------------------------------------------------------

/** Yes/no of a value, as convert_boolean() reads it. */
export function convertBoolean(val: unknown): boolean {
  const first = String(val ?? "")[0];
  return first !== undefined && /[1ty]/.test(first.toLowerCase());
}

const SIZE_UNITS: Record<string, number> = {
  "": 1,
  b: 1,
  k: 1024,
  kb: 1024,
  ki: 1000,
  kib: 1000,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mi: 1000 ** 2,
  mib: 1000 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gi: 1000 ** 3,
  gib: 1000 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
  ti: 1000 ** 4,
  tib: 1000 ** 4,
  p: 1024 ** 5,
  pb: 1024 ** 5,
  pi: 1000 ** 5,
  pib: 1000 ** 5,
  e: 1024 ** 6,
  eb: 1024 ** 6,
  ei: 1000 ** 6,
  eib: 1000 ** 6,
};

/**
 * A size or an integer, as convert_size() computes it: "10G" is 10 gibibytes in
 * bytes, or in the input Unit. As in the historical code, k is 1024 and ki 1000.
 * A text that is not a size is kept as it is.
 */
export function convertSize(val: string, unit: string): number | string {
  if (!/^\s*[0-9]*[.]?[0-9]*\s*[kmgtpe]?i?b?$/i.test(val)) return val;
  if (val === "") return 0;
  const compact = val.replace(/\s+/g, "");
  const u = (/[a-zA-Z]+/.exec(compact)?.[0] ?? "").toLowerCase();
  const digits = /^[0-9]+/.exec(compact)?.[0];
  if (digits === undefined) return val;
  const factor = SIZE_UNITS[u];
  if (factor === undefined) return val;
  const bytes = Number(digits) * factor;
  const target = SIZE_UNITS[unit.toLowerCase() || "b"];
  return target === undefined || target === 1 ? bytes : Math.ceil(bytes / target);
}

/** The value an input contributes, converted as get_converted_val() does. */
export function convertedValue(input: FormInput, val: InputValue): unknown {
  switch (input.type) {
    case "list of string":
      return typeof val === "string" ? val.split(",") : val;
    case "list of size":
      return typeof val === "string" ? val.split(",").map((v) => convertSize(v, "")) : val;
    case "boolean":
      return convertBoolean(val);
    case "string or integer":
    case "size":
    case "integer":
      return typeof val === "string" ? convertSize(val, input.unit) : val;
  }
  return val;
}

/** "key = value" of a forced key, value references taken from the chosen candidate. */
function forcedKey(keyDef: string, optionData: unknown): [string, string] {
  const idx = keyDef.indexOf("=");
  const name = keyDef.slice(0, idx).trim();
  let value = keyDef.slice(idx + 1).trim();
  if (value.includes("#") && optionData !== undefined) value = substRefs(optionData, value);
  return [name, value];
}

/** Values of one group of inputs, and the rows chosen in their candidates. */
export interface GroupState {
  values: Record<string, InputValue>;
  /** Candidate rows of the selected options, for the Keys references. */
  optionData: Record<string, unknown>;
  /** Identity of an entry of a repeated form, kept while entries come and go. */
  uid?: number;
}

/**
 * The data of a group, as table_to_dict() builds it: visible inputs, and the
 * explicitly hidden ones whose condition holds, keyed by Key or Id, forced Keys
 * added from the chosen candidates.
 */
export function groupData(
  def: FormDefinition,
  group: GroupState,
  visible: Set<string>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const input of def.inputs) {
    if (!visible.has(input.id)) {
      if (!input.hidden) continue;
      if (input.condition !== null && !conditionsHold(input, data)) continue;
    }
    const val = convertedValue(input, group.values[input.id]);
    const optionData = group.optionData[input.id];
    if (input.keys.length > 0) {
      if (input.multiple && Array.isArray(val)) {
        const rows = Array.isArray(optionData) ? optionData : [];
        data[input.key] = val.map((_, index) =>
          Object.fromEntries(input.keys.map((k) => forcedKey(k, rows[index]))),
        );
      } else {
        data[input.key] = val;
        for (const k of input.keys) {
          const [name, value] = forcedKey(k, optionData);
          data[name] = value;
        }
      }
    } else {
      data[input.key] = val;
    }
  }
  return data;
}

/**
 * The inputs showing in a group: not explicitly hidden, and their conditions
 * holding for the data of the other inputs. Computed until stable, an input
 * hidden by its condition leaving the data the others are judged on.
 */
export function visibleInputs(def: FormDefinition, group: GroupState): Set<string> {
  let visible = new Set(def.inputs.filter((input) => !input.hidden).map((input) => input.id));
  for (let pass = 0; pass < 5; pass++) {
    const data = groupData(def, group, visible);
    const next = new Set(
      def.inputs
        .filter((input) => !input.hidden && conditionsHold(input, data))
        .map((input) => input.id),
    );
    if (next.size === visible.size && [...next].every((id) => visible.has(id))) return next;
    visible = next;
  }
  return visible;
}

/** The data a submission sends, shaped by the first output Format or Template. */
export function formData(def: FormDefinition, groups: Record<string, unknown>[]): unknown {
  const output = def.output;
  if (output?.template) {
    let t = output.template;
    const first = groups[0] ?? {};
    for (const input of def.inputs) {
      t = t.replaceAll(`%%${input.key}%%`, str(first[input.key]));
    }
    return t;
  }
  switch (output?.format) {
    case "list":
      return groups.flatMap((g) => Object.values(g));
    case "list of dict":
      return groups;
    case "dict of dict": {
      const out: Record<string, unknown> = {};
      for (const g of groups) {
        const copy = { ...g };
        const key = str(copy[output.key]);
        if (!output.embedKey) delete copy[output.key];
        out[key] = copy;
      }
      return out;
    }
  }
  return groups[0] ?? {};
}

/**
 * Inputs whose candidates or dynamic default depend on an input, by id, as
 * add_fn_triggers() records them: a change of the input resets them.
 */
export function dependents(def: FormDefinition): Map<string, FormInput[]> {
  const byRef = (ref: string): string[] =>
    def.inputs
      .filter(
        (input) =>
          input.key === ref ||
          input.id === ref ||
          input.keys.some((k) => k.split("=")[0]?.trim() === ref),
      )
      .map((input) => input.id);
  const out = new Map<string, FormInput[]>();
  for (const input of def.inputs) {
    const sources: string[] = [];
    if (input.hasFunctionKey && input.fn === "" && typeof input.default === "string") {
      // A simple input with a dynamic default, "Function" set empty to enable it.
      sources.push(input.default);
    } else {
      sources.push(input.fn, input.constraint, ...input.args);
      if (Array.isArray(input.condition)) sources.push(...input.condition);
      else if (input.condition !== null) sources.push(input.condition);
    }
    for (const s of sources) {
      for (const m of s.matchAll(/#(\w+)/g)) {
        for (const id of byRef(m[1] ?? "")) {
          if (id === input.id) continue;
          const list = out.get(id) ?? [];
          if (!list.includes(input)) list.push(input);
          out.set(id, list);
        }
      }
    }
  }
  return out;
}
