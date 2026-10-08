import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { EditorPart } from "@/components/opensvc/CompEditorParts";

/** Beyond this many members, a field narrows the list. */
const FILTER_FROM = 20;

interface Member {
  id: number;
  name: string;
  email: string;
}

/** The users member of a group (`GET /groups/{id}/users`), by name. */
function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: ["group", groupId, "users"],
    enabled: groupId !== undefined,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await api.GET("/groups/{group_id}/users", {
        params: {
          path: { group_id: groupId ?? "" },
          query: { props: "id,email,first_name,last_name", limit: 0 },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: { id?: number; email?: string; first_name?: string; last_name?: string }[] =
        Array.isArray(data.data) ? data.data : [];
      return rows
        .flatMap((row) => {
          if (row.id === undefined) return [];
          const email = row.email ?? "";
          const name = [row.first_name, row.last_name].join(" ").trim();
          return [{ id: row.id, name: name === "" ? email : name, email }];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/**
 * The users member of a group, each opening their record, read only: memberships
 * are changed from the panel of a user. A field narrows a long list, by name or
 * email.
 */
export function GroupMembers({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const members = useGroupMembers(groupId);
  const [text, setText] = useState("");
  const all = members.data ?? [];
  const needle = text.trim().toLowerCase();
  const shown =
    needle === ""
      ? all
      : all.filter(
          (m) => m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle),
        );
  return (
    <EditorPart
      title={t("groups.members.title")}
      count={members.data?.length}
      actions={
        all.length > FILTER_FROM && (
          <input
            type="search"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            aria-label={t("groups.members.filter")}
            placeholder={t("groups.members.filter")}
            className="h-7 w-48 rounded-(--radius-control) border border-line bg-surface px-2"
          />
        )
      }
    >
      {members.isPending ? (
        <p className="text-ink-muted">{t("groups.members.loading")}</p>
      ) : members.isError ? (
        <p role="alert" className="text-state-down">
          ■ {members.error.message}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-ink-muted">
          {all.length === 0 ? t("groups.members.none") : t("groups.members.noMatch")}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {shown.map((member) => (
            <li key={member.id}>
              <CrossLink kind="user" id={String(member.id)}>
                {member.name}
              </CrossLink>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-ink-muted">{t("groups.members.hint")}</p>
    </EditorPart>
  );
}
