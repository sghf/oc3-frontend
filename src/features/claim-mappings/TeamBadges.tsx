import { CrossLink } from "@/components/opensvc/CrossLink";
import { teamsOf, type ClaimMappingRow, type TeamKind } from "./claim-mapping-api";

/**
 * The teams of one kind a rule grants, one badge each opening its record; nothing
 * when it grants none of that kind. The list and the detail show the privilege
 * groups and the organizational groups apart, each with this.
 */
export function TeamBadges({ row, kind }: { row: ClaimMappingRow; kind: TeamKind }) {
  const teams = teamsOf(row, kind);
  if (teams.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {teams.map((team) => (
        <CrossLink key={team.id} kind="group" id={String(team.id)}>
          {team.role}
        </CrossLink>
      ))}
    </span>
  );
}
