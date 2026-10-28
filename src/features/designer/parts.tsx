import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { personalGroupUser, useTeamLabel } from "@/components/opensvc/use-team-label";
import { Combobox } from "@/components/ui/Combobox";
import { CloseIcon, PencilIcon, PlusIcon } from "@/components/ui/icons";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { useDesigner } from "./designer-context";
import { useDraggable, useDropTarget, type DragItem, type DropTarget } from "./drag";
import {
  objectOf,
  type ObjectKind,
  type ObjectRef,
  type Operation,
  type Refusal,
  type TeamRole,
} from "./model";
import { BUTTON, SelectContext, dropClasses } from "./ui";
import { useComplianceGroups } from "./use-designer-data";

/** A part of an editor: a heading, its actions, and its content. */
export function Section({
  title,
  count,
  actions,
  hint,
  children,
  target,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  /** A line under the heading, such as how to fill the section. */
  hint?: string;
  children: ReactNode;
  /** The drop target the section is, when it accepts dragged items. */
  target?: DropTarget;
}) {
  return (
    <section
      {...target?.props}
      className={`rounded-(--radius-panel) border border-line bg-surface p-3 outline-offset-2 ${
        target === undefined ? "" : dropClasses(target)
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">
          {title}
          {count !== undefined && (
            <span className="ml-1 font-normal text-ink-muted">({count})</span>
          )}
        </h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {hint !== undefined && <p className="mb-2 text-ink-muted">{hint}</p>}
      {children}
    </section>
  );
}

/**
 * A name shown as text, turned into a field by its pencil: Enter keeps the new
 * name, Escape gives it up. A refused name keeps the field open with the reason.
 */
export function InlineName({
  value,
  label,
  onCommit,
  className = "",
}: {
  value: string;
  label: string;
  onCommit: (name: string) => Refusal | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<Refusal | null>(null);
  if (editing === null)
    return (
      <span className={`group inline-flex items-center gap-1 ${className}`}>
        <span>{value}</span>
        <button
          type="button"
          title={t("designer.renameLabel", { name: label })}
          aria-label={t("designer.renameLabel", { name: label })}
          onClick={() => {
            setEditing(value);
            setError(null);
          }}
          className="rounded-(--radius-control) p-0.5 text-ink-muted opacity-60 group-hover:opacity-100 hover:text-ink focus:opacity-100"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  const commit = () => {
    if (editing.trim() === value) {
      setEditing(null);
      return;
    }
    const refused = onCommit(editing);
    if (refused === null) setEditing(null);
    else setError(refused);
  };
  return (
    <span className="inline-flex flex-col">
      <input
        autoFocus
        aria-label={t("designer.renameLabel", { name: label })}
        value={editing}
        onChange={(event) => {
          setEditing(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            event.stopPropagation();
            setEditing(null);
          }
        }}
        onBlur={commit}
        className={`h-8 rounded-(--radius-control) border border-accent bg-surface px-2 ${className}`}
      />
      {error !== null && <span className="text-state-down">■ {t(error.key, error.values)}</span>}
    </span>
  );
}

/** A field and a button adding something by its name. */
export function AddByName({
  label,
  placeholder,
  fieldLabel,
  fill = false,
  focusOnOpen = false,
  onAdd,
  children,
}: {
  /** The text of the button. */
  label: string;
  placeholder: string;
  /** The accessible name of the field, the placeholder when it says enough. */
  fieldLabel?: string;
  /** The field takes the width left by the button, as in the narrow navigator. */
  fill?: boolean;
  /** The field takes the focus when it appears, opened by the user to type a name. */
  focusOnOpen?: boolean;
  onAdd: (name: string) => Refusal | null;
  /** Controls between the field and the button, such as the class of a variable. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<Refusal | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusOnOpen) input.current?.focus();
  }, [focusOnOpen]);
  const submit = () => {
    const refused = onAdd(name);
    setError(refused);
    if (refused === null) {
      setName("");
      input.current?.focus();
    }
  };
  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          aria-label={fieldLabel ?? placeholder}
          placeholder={placeholder}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          className={`h-7 rounded-(--radius-control) border border-line bg-surface px-2 ${fill ? "min-w-0 flex-1" : "w-56"}`}
        />
        {children}
        <button type="submit" className={BUTTON}>
          <PlusIcon className="h-3.5 w-3.5" />
          {label}
        </button>
      </form>
      {error !== null && <p className="mt-1 text-state-down">■ {t(error.key, error.values)}</p>}
    </div>
  );
}

/** A field choosing a ruleset or a moduleset of the draft by its name. */
export function ObjectPicker({
  kind,
  label,
  exclude = [],
  onPick,
}: {
  kind: ObjectKind;
  label: string;
  exclude?: number[];
  onPick: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { draft } = useDesigner();
  const all = kind === "ruleset" ? Object.values(draft.rulesets) : Object.values(draft.modulesets);
  const options = all
    .filter((o) => !exclude.includes(o.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((o) => ({ value: String(o.id), label: o.name }));
  return (
    <Combobox
      options={options}
      value=""
      onChange={(value) => {
        if (value !== "") onPick(Number(value));
      }}
      label={label}
      placeholder={label}
      emptyText={t("designer.noMatch")}
      className="w-64"
    />
  );
}

/** A link to an object of the draft: selects it; draggable like the navigator items. */
export function ObjectLink({ refTo, suffix }: { refTo: ObjectRef; suffix?: ReactNode }) {
  const { draft } = useDesigner();
  const select = useContext(SelectContext);
  const obj = objectOf(draft, refTo);
  const drag = useDraggable({ type: refTo.kind, id: refTo.id }, obj?.name ?? "");
  if (obj === undefined) return null;
  return (
    <button
      type="button"
      {...drag}
      onClick={() => {
        select(refTo);
      }}
      className="inline-flex items-center gap-1 rounded-(--radius-control) px-1 hover:bg-surface-sunken"
    >
      <ObjectIcon kind={refTo.kind} className="h-3.5 w-3.5" />
      <span className="font-medium">{obj.name}</span>
      {suffix}
    </button>
  );
}

/** The responsible and publication groups of an object, each list a drop target for the other's. */
export function TeamsEditor({ refTo }: { refTo: ObjectRef }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TeamList
        refTo={refTo}
        role="responsibles"
        other="publications"
        title={t("designer.teams.responsibles")}
      />
      <TeamList
        refTo={refTo}
        role="publications"
        other="responsibles"
        title={t("designer.teams.publications")}
      />
    </div>
  );
}

function TeamList({
  refTo,
  role,
  other,
  title,
}: {
  refTo: ObjectRef;
  role: TeamRole;
  other: TeamRole;
  title: string;
}) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const groups = useComplianceGroups();
  const label = useTeamLabel();
  const obj = objectOf(designer.draft, refTo);
  const target = useDropTarget((item: DragItem): Operation | null => {
    if (
      item.type === "team" &&
      item.kind === refTo.kind &&
      item.id === refTo.id &&
      item.role === other
    )
      return { op: "moveTeam", ref: refTo, from: other, to: role, team: item.team };
    // A group dragged from the list takes the role of the list it is dropped on.
    if (item.type === "group") return { op: "addTeam", ref: refTo, role, team: item.role };
    return null;
  });
  if (obj === undefined) return null;
  const teams = obj[role];
  return (
    <div
      {...target.props}
      className={`rounded-(--radius-control) border border-line p-2 outline-offset-1 ${dropClasses(target)}`}
    >
      <p className="mb-1 font-medium">{title}</p>
      <ul className="mb-2 flex min-h-7 flex-wrap gap-1">
        {teams.length === 0 && <li className="text-ink-muted">{t("designer.teams.none")}</li>}
        {teams.map((team) => (
          <TeamChip key={team} refTo={refTo} role={role} team={team} />
        ))}
      </ul>
      <Combobox
        options={(groups.data ?? [])
          .filter((g) => !teams.includes(g.role))
          .map((g) => ({ value: g.role, label: label(g.role) }))}
        value=""
        onChange={(team) => {
          if (team !== "") designer.runAndTell({ op: "addTeam", ref: refTo, role, team });
        }}
        label={t("designer.teams.add", { list: title })}
        placeholder={t("designer.teams.add", { list: title })}
        emptyText={t("designer.noMatch")}
        className="w-full"
      />
    </div>
  );
}

function TeamChip({ refTo, role, team }: { refTo: ObjectRef; role: TeamRole; team: string }) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const label = useTeamLabel();
  const name = label(team);
  const drag = useDraggable({ type: "team", kind: refTo.kind, id: refTo.id, role, team }, name);
  return (
    <li
      {...drag}
      title={t("designer.teams.dragHint")}
      className="inline-flex cursor-grab items-center gap-1 rounded-full border border-line bg-surface py-0.5 pr-1 pl-2"
    >
      <ObjectIcon
        kind={personalGroupUser(team) === undefined ? "group" : "user"}
        className="h-3.5 w-3.5"
      />
      {name}
      <button
        type="button"
        aria-label={t("designer.teams.remove", { team: name })}
        title={t("designer.teams.remove", { team: name })}
        onClick={() => {
          designer.runAndTell({ op: "removeTeam", ref: refTo, role, team });
        }}
        className="rounded-full p-0.5 text-ink-muted hover:bg-surface-sunken hover:text-state-down"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </li>
  );
}
