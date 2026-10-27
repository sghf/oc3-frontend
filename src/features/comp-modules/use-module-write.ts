import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CompModuleDetail } from "./comp-modules-api";

/**
 * Runs the changes of a module: each one from the revision on display, the
 * module as changed then shown in place of it. A change refused because the
 * module changed meanwhile keeps what was being written and offers to reload.
 */
export function useModuleWrite(module: CompModuleDetail) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run(
    change: (base: string) => Promise<CompModuleDetail>,
  ): Promise<CompModuleDetail | undefined> {
    setPending(true);
    setError(null);
    try {
      const next = await change(module.changed?.id ?? "");
      // Under its name, the new one after a rename.
      queryClient.setQueryData(["compliance-modules", next.name], next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["compliance-modules"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["compliance-modules", module.name, "file"] }),
      ]);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      return undefined;
    } finally {
      setPending(false);
    }
  }

  function reload() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["compliance-modules", module.name] });
  }

  return { run, pending, error, reload };
}
