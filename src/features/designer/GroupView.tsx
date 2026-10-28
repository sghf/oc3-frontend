import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { personalGroupUser, useTeamLabel } from "@/components/opensvc/use-team-label";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { useDesigner } from "./designer-context";
import { useDraggable } from "./drag";
import type { Moduleset, Ruleset, TeamRole } from "./model";
import { ObjectLink, Section } from "./parts";
import { BUTTON } from "./ui";
import { useComplianceGroups } from "./use-designer-data";

/**
 * A group as the designer shows it: the rulesets and modulesets of the draft it is
 * responsible for or published to, each with the way to take it off. The group
 * itself, its members and privileges, is managed in the Groups view.
 */
export function GroupView({ id }: { id: number }) {
  const { t } = useTranslation();
  const groups = useComplianceGroups();
  const group = groups.data?.find((g) => g.id === id);
  const label = useTeamLabel();
  const role = group?.role ?? "";
  const personal = personalGroupUser(role) !== undefined;
  const drag = useDraggable({ type: "group", id, role }, label(role));
  if (groups.isPending) return <p className="text-ink-muted">{t("designer.loading")}</p>;
  if (group === undefined)
    return <p className="text-state-warn">▲ {t("designer.welcome.missing")}</p>;
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <span
          {...drag}
          title={t("designer.groupDragHint")}
          className="flex cursor-grab items-center gap-2"
        >
          <ObjectIcon kind={personal ? "user" : "group"} className="h-5 w-5" />
          <h2 className="text-title font-semibold">{label(group.role)}</h2>
        </span>
        <span className="text-ink-muted">
          {personal
            ? t("designer.kind.personalGroup", { role: group.role })
            : t("designer.kind.group")}
        </span>
        <Link
          to="/groups"
          search={{ sel: String(id) }}
          className="ml-auto underline decoration-line underline-offset-2"
        >
          {t("designer.editInGroups")}
        </Link>
      </header>
      <p className="text-ink-muted">{t("designer.groupReadOnly")}</p>
      <RoleSection
        role="responsibles"
        team={group.role}
        title={t("designer.groupResponsibleFor")}
      />
      <RoleSection role="publications" team={group.role} title={t("designer.groupPublishedTo")} />
    </div>
  );
}

/** The objects of the draft naming the group in one of their team lists. */
function RoleSection({ role, team, title }: { role: TeamRole; team: string; title: string }) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const objects: (Ruleset | Moduleset)[] = [
    ...Object.values(designer.draft.modulesets),
    ...Object.values(designer.draft.rulesets),
  ]
    .filter((o) => o[role].includes(team))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return (
    <Section title={title} count={objects.length} hint={t("designer.groupDragHint")}>
      {objects.length === 0 ? (
        <p className="text-ink-muted">{t("designer.none")}</p>
      ) : (
        <ul className="space-y-1">
          {objects.map((o) => (
            <li key={`${o.kind}:${String(o.id)}`} className="flex items-center gap-2">
              <ObjectLink refTo={{ kind: o.kind, id: o.id }} />
              <button
                type="button"
                className={`${BUTTON} ml-auto`}
                onClick={() => {
                  designer.runAndTell({
                    op: "removeTeam",
                    ref: { kind: o.kind, id: o.id },
                    role,
                    team,
                  });
                }}
              >
                {t("designer.teams.removeShort")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
