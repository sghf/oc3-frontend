import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/**
 * The check types the agents report, the most frequent first: the suggestions of
 * the type fields of the thresholds, as the historical forms offered them
 * (`GET /checks/live?groupby=chk_type`). A type no check has yet can still be
 * typed.
 */
export function useCheckTypes(enabled: boolean) {
  return useQuery({
    queryKey: ["checks", "types"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await api.GET("/checks/live", {
        params: { query: { props: "chk_type", stats: "1", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const counts = (data.data as Record<string, Record<string, number> | undefined>).chk_type;
      return Object.entries(counts ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([type]) => type);
    },
  });
}

/** An integer typed in a field, undefined when empty, NaN when not an integer. */
export function parseInteger(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Whether a regular expression compiles, as the API checks it. */
export function isPattern(text: string): boolean {
  try {
    new RegExp(text);
    return true;
  } catch {
    return false;
  }
}
