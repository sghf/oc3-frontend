import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { personalGroupUser, useTeamLabel } from "@/components/opensvc/use-team-label";

/**
 * Ids of the groups, by role name.
 *
 * The lists carry only the name of a team, whereas the Groups view names its rows by
 * the integer id of `auth_group` and `GET /groups/{id}` refuses a name — unlike
 * `GET /apps/{app_id}`, which accepts the code. The matching is therefore done here,
 * in a single shared and cached request.
 */
function useGroupIds() {
  return useQuery({
    queryKey: ["groups", "by-role"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET("/groups", {
        params: { query: { props: "id,role", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      return new Map(
        rows
          .filter((row) => row.role !== undefined && row.id !== undefined)
          .map((row) => [row.role ?? "", String(row.id)]),
      );
    },
  });
}

/**
 * Team name in a list: a badge that opens the Groups view on that group. The
 * private group of a user is named after them and opens their record.
 */
export function TeamLink({ name }: { name: unknown }) {
  const ids = useGroupIds();
  const label = useTeamLabel();
  if (typeof name !== "string" || name === "") return <>{name}</>;
  const user = personalGroupUser(name);
  if (user !== undefined) {
    return (
      <CrossLink kind="user" id={user}>
        {label(name)}
      </CrossLink>
    );
  }
  return (
    <CrossLink kind="group" id={ids.data?.get(name)}>
      {name}
    </CrossLink>
  );
}

/** Teams listed as "a, b, c", as the collector aggregates them: one badge per team. */
export function TeamLinks({ value }: { value: string | undefined }) {
  if (value === undefined || value === "") return null;
  return (
    <span className="flex flex-wrap gap-1">
      {value.split(", ").map((role) => (
        <TeamLink key={role} name={role} />
      ))}
    </span>
  );
}
