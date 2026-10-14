import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ActionsMenu, type ActionTarget, type DataActionEntry } from "./ActionsMenu";

/**
 * The Actions menu of a list whose objects the agents do not act on: the deletion
 * of the rows checked, its only data action, as in the historical collector
 * ("Data actions › On groups", "On tags"…). Each object is deleted on its own, with
 * the route its detail panel uses, so that a refusal names its object and the
 * others go.
 *
 * Its texts come from `<prefix>.open`, `.failure` and `<prefix>.data.delete.*`, see
 * ActionsMenu. The entry is shown to the holders of `privileges`, the API checking
 * each object again (responsibility, immutable objects…). `warnings`, read when the
 * confirmation opens, tells what the deletion would also remove, such as the
 * filtersets using a filter. Nothing checked, no menu.
 */
export function SelectionDeleteMenu({
  targets,
  prefix,
  privileges,
  remove,
  invalidate,
  warnings,
  onDeleted,
}: {
  targets: ActionTarget[];
  /** Prefix of the translation keys, for example `groups.actions`. */
  prefix: string;
  privileges: readonly string[];
  /** Deletes one object; returns the API error message, or null. */
  remove: (id: string) => Promise<string | null>;
  /** Cache roots to read again once something is deleted: the list, its counts… */
  invalidate: readonly QueryKey[];
  warnings?: DataActionEntry["warnings"];
  /** Receives the ids of the objects deleted: to untick them, close their panel. */
  onDeleted?: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const entry: DataActionEntry = {
    key: "delete",
    privileges,
    warnings,
    run: (target) => remove(target.id),
    onDone: (done) => {
      if (done.length === 0) return;
      for (const queryKey of invalidate) void queryClient.invalidateQueries({ queryKey });
      onDeleted?.(done.map((target) => target.id));
    },
  };
  return <ActionsMenu targets={targets} dataActions={[entry]} prefix={prefix} />;
}
