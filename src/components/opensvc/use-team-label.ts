import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/**
 * The private group of a user, `user_<id>`, which the collector creates with the
 * account (`group uniquely assigned to user <id>`): an object published to one
 * person, or under their responsibility, names it.
 */
const PERSONAL_GROUP = /^user_([0-9]+)$/;

/** The user id of a private group, undefined for a team. */
export function personalGroupUser(role: string): string | undefined {
  return PERSONAL_GROUP.exec(role)?.[1];
}

/** The names of the users, by id: "first last", the e-mail when both are empty. */
function useUserNames() {
  return useQuery({
    queryKey: ["users", "names-by-id"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET("/users", {
        params: { query: { props: "id,first_name,last_name,email", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      const names = new Map<string, string>();
      for (const row of rows) {
        if (row.id === undefined) continue;
        const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim().replace(/\s+/g, " ");
        const label = name === "" ? (row.email ?? "") : name;
        if (label !== "") names.set(String(row.id), label);
      }
      return names;
    },
  });
}

/**
 * How a group is named on screen: a team by its role, a private group by the
 * name of its user. A user the requester cannot read, or not loaded yet, leaves
 * the role, which still identifies the group.
 */
export function useTeamLabel(): (role: string) => string {
  const names = useUserNames();
  const data = names.data;
  return useCallback(
    (role: string) => {
      const user = personalGroupUser(role);
      return (user === undefined ? undefined : data?.get(user)) ?? role;
    },
    [data],
  );
}
