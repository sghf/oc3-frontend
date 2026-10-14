import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ChangeOutcomeLine, EditorPart, RemoveButton } from "@/components/opensvc/CompEditorParts";
import { useChanges } from "@/components/opensvc/comp-changes";
import { Combobox } from "@/components/ui/Combobox";

/** Beyond this many members, a field narrows the list. */
const FILTER_FROM = 20;

interface Member {
  id: number;
  name: string;
  email: string;
}

function toMembers(data: unknown): Member[] {
  const rows: { id?: number; email?: string; first_name?: string; last_name?: string }[] =
    Array.isArray(data) ? data : [];
  return rows
    .flatMap((row) => {
      if (row.id === undefined) return [];
      const email = row.email ?? "";
      const name = [row.first_name, row.last_name].join(" ").trim();
      return [{ id: row.id, name: name === "" ? email : name, email }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The users the caller may add to a group: those `GET /users` shows them, every user
 * for a Manager, the users sharing one of their organizational groups otherwise.
 */
function useUserCandidates(enabled: boolean) {
  return useQuery({
    queryKey: ["users", "membership-candidates"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await api.GET("/users", {
        params: { query: { props: "id,email,first_name,last_name", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return toMembers(data.data);
    },
  });
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
      return toMembers(data.data);
    },
  });
}

/**
 * The users member of a group, each opening their record. A field narrows a long
 * list, by name or email. When `editable`, a picker adds a user and each member has
 * a remove button, each change written at once, as from the panel of a user.
 */
export function GroupMembers({ groupId, editable }: { groupId: string; editable: boolean }) {
  const { t } = useTranslation();
  const members = useGroupMembers(groupId);
  const candidates = useUserCandidates(editable);
  const queryClient = useQueryClient();
  // The members, the groups of the user who came or went, the caller's own
  // privileges when it was them, and the lists of users and groups.
  const { outcome, busy, change, dismiss } = useChanges(async () => {
    await Promise.all(
      [["group"], ["groups"], ["user"], ["users"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  });
  const [text, setText] = useState("");
  const all = members.data ?? [];
  const offered = (candidates.data ?? []).filter((u) => !all.some((m) => m.id === u.id));
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
        <>
          {editable && (
            <Combobox
              options={offered.map((u) => ({
                value: String(u.id),
                label: u.email === "" || u.email === u.name ? u.name : `${u.name} <${u.email}>`,
              }))}
              value=""
              onChange={(id) => {
                const user = offered.find((u) => String(u.id) === id);
                if (user === undefined) return;
                void change(t("groups.members.added", { user: user.name }), () =>
                  api.POST("/users/{user_id}/groups/{group_id}", {
                    params: { path: { user_id: id, group_id: groupId } },
                  }),
                );
              }}
              label={t("groups.members.add")}
              placeholder={t("groups.members.add")}
              emptyText={t("compEditor.noMatch")}
              className="w-56"
            />
          )}
          {all.length > FILTER_FROM && (
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
          )}
        </>
      }
    >
      <ChangeOutcomeLine outcome={outcome} onDismiss={dismiss} />
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
            <li key={member.id} className="inline-flex items-center gap-0.5">
              <CrossLink kind="user" id={String(member.id)}>
                {member.name}
              </CrossLink>
              {editable && (
                <RemoveButton
                  label={t("groups.members.remove", { user: member.name })}
                  round
                  disabled={busy}
                  onClick={() => {
                    void change(t("groups.members.removed", { user: member.name }), () =>
                      api.DELETE("/users/{user_id}/groups/{group_id}", {
                        params: { path: { user_id: String(member.id), group_id: groupId } },
                      }),
                    );
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-ink-muted">
        {t(editable ? "groups.members.editHint" : "groups.members.hint")}
      </p>
    </EditorPart>
  );
}
