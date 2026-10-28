import { useCallback } from "react";
import { useTeamLabel } from "@/components/opensvc/use-team-label";

/**
 * The values of a change log line or a refusal, the team they name, if any, as
 * shown on screen: the private group of a user by the user's name. The lines
 * keep the role, which the commit message of the compliance history records.
 */
export function useTeamValues() {
  const label = useTeamLabel();
  return useCallback(
    (values: Record<string, string> | undefined): Record<string, string> | undefined => {
      const team = values?.team;
      return team === undefined ? values : { ...values, team: label(team) };
    },
    [label],
  );
}
