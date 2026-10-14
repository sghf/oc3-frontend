import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { labelMatches, normalizeSearch } from "@/lib/label-search";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { ChevronDownIcon, EyeOffIcon, SearchIcon } from "@/components/ui/icons";
import {
  NAV_CATEGORIES,
  NAV_TOP,
  NAV_VIEWS,
  type MenuId,
  type NavEntry,
  type NavView,
} from "@/app/layout/navigation";
import { useGroup, useGroupHiddenEntries } from "./group-hidden-entries";

type Effect = components["schemas"]["GroupHiddenMenuEffect"];
type EffectEntry = Effect["entries"][number];
type EffectMember = EffectEntry["members"][number];

/** What the hidden entries of the group really hide to its members. */
function useGroupMenuEffect(groupId: string) {
  return useQuery({
    queryKey: ["group", groupId, "hiddenMenuEffect"],
    queryFn: async () => {
      const { data, error } = await api.GET("/groups/{group_id}/hidden_menu_entries/effect", {
        params: { path: { group_id: groupId } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/** The sections of a view of the menu, its top entries first as a section of their own. */
function sectionsOf(
  view: NavView,
): { key: string; labelKey: string | null; entries: NavEntry[] }[] {
  const top = view === "operator" ? [{ key: "top", labelKey: null, entries: NAV_TOP }] : [];
  return [
    ...top,
    ...NAV_CATEGORIES.filter((category) => category.view === view).map((category) => ({
      key: category.key,
      labelKey: category.labelKey,
      entries: category.entries,
    })),
  ];
}

/** A checkbox in its third state: some entries of the section shown, others hidden. */
function TriStateBox({
  checked,
  mixed,
  disabled,
  busy,
  label,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  disabled: boolean;
  busy: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-busy={busy}
      aria-label={label}
      onChange={onChange}
    />
  );
}

/**
 * The menu entries an organizational group hides, in the Menu tab of its panel: the
 * whole menu as the side menu shows it, its two views side by side, by section,
 * with a filter of the entries by name. A GroupManager shows or hides an entry, or
 * a whole section at once; the others read them.
 *
 * As in the historical collector, an entry is hidden to a user only when every
 * organizational group of the user hides it, the Everybody group and the privilege
 * groups apart, the personal group of the user (user_<id>) included. A hidden
 * entry therefore says how many members it really hides from, and which of their
 * groups keep it shown to the others; hiding it from none, it says why, and offers
 * to hide it on the personal groups that keep it.
 */
export function GroupMenuEntries({ groupId, role }: { groupId: string; role: string | undefined }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const privileges = useEffectivePrivileges();
  const editable = privileges.data !== undefined && hasPrivilege(privileges.data, ["GroupManager"]);
  const hidden = useGroupHiddenEntries(groupId);
  const effect = useGroupMenuEffect(groupId);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [opened, setOpened] = useState<MenuId | null>(null);
  const needle = normalizeSearch(query.trim());

  // The entries being written: only their boxes wait, the others stay as they are.
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(new Set());
  // What the boxes of this group show while their request runs, set on the click
  // itself: the cache follows a moment later, after any read in progress is
  // cancelled, and a controlled box would show its old state in between.
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(new Map());
  const hiddenKey = ["group", groupId, "hiddenMenuEntries"];

  /**
   * Hides or shows entries on groups, one request each: this group, or personal
   * ones. The boxes of this group follow at once (the cache is set before the
   * requests, and set back should one fail); then only what the change affects is
   * read again: the entries and the effect of this group, those of the personal
   * groups written, and the menu of the user, should the group be one of theirs.
   */
  const write = useMutation({
    mutationFn: async (changes: { groupId: string; menuId: string; hide: boolean }[]) => {
      for (const change of changes) {
        const params = { path: { group_id: change.groupId } };
        const body = { menu_entry: change.menuId };
        const { error } = change.hide
          ? await api.POST("/groups/{group_id}/hidden_menu_entries", { params, body })
          : await api.DELETE("/groups/{group_id}/hidden_menu_entries", { params, body });
        if (error !== undefined) throw new Error(problemText(error));
      }
    },
    onMutate: async (changes) => {
      const own = changes.filter((change) => change.groupId === groupId);
      if (own.length === 0) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: hiddenKey });
      const previous = queryClient.getQueryData<Set<string>>(hiddenKey);
      const next = new Set(previous);
      for (const change of own) {
        if (change.hide) next.add(change.menuId);
        else next.delete(change.menuId);
      }
      queryClient.setQueryData(hiddenKey, next);
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(hiddenKey, context.previous);
    },
    onSettled: async (_data, _error, changes) => {
      // Read again first, then let the boxes follow the cache: a read started
      // before the write was over, by a change notice of a previous one, would
      // otherwise show the state before it for a moment. invalidateQueries
      // cancels such a read and starts it over.
      const groups = new Set(changes.map((change) => change.groupId));
      await Promise.all([
        ...[...groups].map((id) =>
          queryClient.invalidateQueries({ queryKey: ["group", id, "hiddenMenuEntries"] }),
        ),
        queryClient.invalidateQueries({ queryKey: ["group", groupId, "hiddenMenuEffect"] }),
        queryClient.invalidateQueries({ queryKey: ["user", "self", "hiddenMenuEntries"] }),
      ]);
      setInFlight((previous) => {
        const next = new Set(previous);
        for (const change of changes) next.delete(change.menuId);
        return next;
      });
      setPending((previous) => {
        const next = new Map(previous);
        for (const change of changes) if (change.groupId === groupId) next.delete(change.menuId);
        return next;
      });
    },
  });
  // Before the first read, nothing is known to change.
  const loading = hidden.data === undefined;
  // An entry being written takes no other click until its request is over, so that
  // two requests on it cannot cross; its box is not disabled for that, which would
  // dim it for the time of the request.
  const waiting = (entries: NavEntry[]) => entries.some((entry) => inFlight.has(entry.menuId));
  /** Whether this group hides the entry, as its box shows it. */
  const isHiddenHere = (menuId: string) => pending.get(menuId) ?? hidden.data?.has(menuId) === true;
  const run = (changes: { groupId: string; menuId: string; hide: boolean }[]) => {
    if (changes.length === 0) return;
    setInFlight((previous) => new Set([...previous, ...changes.map((change) => change.menuId)]));
    setPending((previous) => {
      const next = new Map(previous);
      for (const change of changes)
        if (change.groupId === groupId) next.set(change.menuId, change.hide);
      return next;
    });
    write.mutate(changes);
  };
  const setHidden = (entries: NavEntry[], hide: boolean) => {
    run(
      entries
        .filter((entry) => isHiddenHere(entry.menuId) !== hide)
        .map((entry) => ({ groupId, menuId: entry.menuId, hide })),
    );
  };

  const effectOf = (menuId: MenuId): EffectEntry | undefined =>
    effect.data?.entries.find((entry) => entry.menu_entry === menuId);
  const total = effect.data?.members ?? 0;

  const row = (entry: NavEntry) => {
    const isHidden = isHiddenHere(entry.menuId);
    const fx = isHidden ? effectOf(entry.menuId) : undefined;
    const losing = fx?.members.filter((member) => member.hidden).length ?? 0;
    const label = t(entry.labelKey);
    return (
      <li key={entry.menuId}>
        <div className="flex min-h-7 items-center gap-2">
          <input
            type="checkbox"
            checked={!isHidden}
            disabled={!editable || loading}
            aria-busy={waiting([entry])}
            aria-label={t("groups.menu.showEntry", { entry: label })}
            onChange={() => {
              if (!waiting([entry])) setHidden([entry], !isHidden);
            }}
          />
          {isHidden ? (
            <EyeOffIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          ) : (
            <ObjectIcon kind={entry.icon} className="h-3.5 w-3.5" />
          )}
          <span className={`min-w-0 flex-1 truncate ${isHidden ? "text-ink-muted" : ""}`}>
            {label}
          </span>
          {isHidden && (
            <button
              type="button"
              aria-expanded={opened === entry.menuId}
              onClick={() => {
                setOpened(opened === entry.menuId ? null : entry.menuId);
              }}
              className={`shrink-0 rounded-(--radius-control) px-1.5 hover:bg-surface-sunken ${
                fx !== undefined && losing === 0 ? "text-state-warn" : "text-ink-muted"
              }`}
            >
              {fx !== undefined && losing === 0 && <span aria-hidden="true">▲ </span>}
              {t("groups.menu.hiddenFor", { count: losing, total })}
            </button>
          )}
        </div>
        {isHidden && opened === entry.menuId && fx !== undefined && (
          <EffectDetails
            entry={fx}
            editable={editable}
            busy={waiting([entry])}
            onHidePersonal={(personal) => {
              run(
                personal.map((id) => ({ groupId: String(id), menuId: entry.menuId, hide: true })),
              );
            }}
          />
        )}
      </li>
    );
  };

  return (
    <section aria-label={t("groups.menu.title")} className="flex flex-col gap-3">
      <p className="text-ink-muted">
        {t("groups.menu.intro", { role: role ?? "" })}
        {!editable && ` ${t("groups.menu.readOnly")}`}
      </p>
      <div className="flex h-8 w-full max-w-72 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder={t("groups.menu.filter")}
          aria-label={t("groups.menu.filter")}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none"
        />
      </div>
      {hidden.isError && (
        <p role="alert" className="text-state-down">
          ■ {hidden.error.message}
        </p>
      )}
      {effect.isError && (
        <p role="alert" className="text-state-down">
          ■ {effect.error.message}
        </p>
      )}
      {write.isError && (
        <p role="alert" className="text-state-down">
          ■ {write.error.message}
        </p>
      )}
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))] gap-4">
        {NAV_VIEWS.map((view) => (
          <div key={view}>
            <h4 className="mb-1 font-semibold">{t(`nav.views.${view}`)}</h4>
            {sectionsOf(view).map((section) => {
              const entries = section.entries.filter(
                (entry) => needle === "" || labelMatches(i18n, entry.labelKey, needle),
              );
              if (entries.length === 0) return null;
              const shown = section.entries.filter((entry) => !isHiddenHere(entry.menuId));
              const isFolded = folded.has(section.key) && needle === "";
              const sectionName = section.labelKey === null ? null : t(section.labelKey);
              return (
                <div key={section.key} className="mt-1">
                  {sectionName !== null && (
                    <div className="flex items-center gap-2">
                      <TriStateBox
                        checked={shown.length === section.entries.length}
                        mixed={shown.length > 0 && shown.length < section.entries.length}
                        disabled={!editable || loading}
                        busy={waiting(section.entries)}
                        label={t("groups.menu.showSection", { section: sectionName })}
                        onChange={() => {
                          if (!waiting(section.entries))
                            setHidden(section.entries, shown.length === section.entries.length);
                        }}
                      />
                      <button
                        type="button"
                        aria-expanded={!isFolded}
                        onClick={() => {
                          const next = new Set(folded);
                          if (next.has(section.key)) next.delete(section.key);
                          else next.add(section.key);
                          setFolded(next);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-1 text-left text-data font-semibold text-ink-muted uppercase hover:text-ink"
                      >
                        <ChevronDownIcon
                          className={`h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none ${isFolded ? "-rotate-90" : ""}`}
                        />
                        <span className="truncate">{sectionName}</span>
                      </button>
                      <span className="shrink-0 text-ink-muted">
                        {t("groups.menu.sectionShown", {
                          shown: shown.length,
                          count: section.entries.length,
                        })}
                      </span>
                    </div>
                  )}
                  {!isFolded && (
                    <ul className={sectionName === null ? "" : "pl-5"}>{entries.map(row)}</ul>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Who a hidden entry hides from, and why the others still see it: the groups of
 * each that show it. Hiding it from none, the reason and, for a GroupManager, the
 * personal groups to hide it on, those that alone keep it shown to their member.
 */
function EffectDetails({
  entry,
  editable,
  busy,
  onHidePersonal,
}: {
  entry: EffectEntry;
  editable: boolean;
  busy: boolean;
  onHidePersonal: (groupIds: number[]) => void;
}) {
  const { t } = useTranslation();
  const name = (member: EffectMember) => (member.name === "" ? member.email : member.name);
  const losing = entry.members.filter((member) => member.hidden);
  const seeing = entry.members.filter((member) => !member.hidden);
  // Members whose personal group alone keeps the entry: hiding it there hides it to them.
  const personalOnly = seeing.flatMap((member) =>
    member.kept_by.length > 0 && member.kept_by.every((group) => group.personal)
      ? member.kept_by.map((group) => group.group_id)
      : [],
  );
  return (
    <div className="mb-2 ml-6 flex flex-col gap-1.5 rounded-(--radius-control) border border-line bg-surface p-2">
      {entry.members.length === 0 ? (
        <p className="text-ink-muted">{t("groups.menu.noMembers")}</p>
      ) : (
        <>
          {losing.length === 0 && (
            <p className="text-state-warn">
              <span aria-hidden="true">▲ </span>
              {t("groups.menu.hiddenForNone")}
            </p>
          )}
          {losing.length > 0 && (
            <p>
              <span className="font-medium">{t("groups.menu.hiddenTo")}</span>{" "}
              {losing.map(name).join(", ")}
            </p>
          )}
          {seeing.length > 0 && (
            <div>
              <p className="font-medium">{t("groups.menu.shownTo")}</p>
              <ul className="pl-3">
                {seeing.map((member) => (
                  <li key={member.user_id}>
                    {name(member)}{" "}
                    <span className="text-ink-muted">
                      {t("groups.menu.keptBy", {
                        groups: member.kept_by
                          .map((group) =>
                            group.personal ? t("groups.menu.personalGroup") : group.role,
                          )
                          .join(", "),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {editable && personalOnly.length > 0 && (
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onHidePersonal(personalOnly);
                }}
                className="h-7 rounded-(--radius-control) border border-line px-2 hover:bg-surface-sunken disabled:opacity-60"
              >
                {t("groups.menu.hidePersonal", { count: personalOnly.length })}
              </button>
              <p className="mt-1 text-ink-muted">{t("groups.menu.hidePersonalHint")}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The Menu tab of a group's panel: its entries, with the name of the group. */
export function GroupMenuTab({ groupId }: { groupId: string }) {
  const group = useGroup(groupId);
  return <GroupMenuEntries groupId={groupId} role={group.data?.role} />;
}
