import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/**
 * The names of the forms a tag's data can be described with: every form but the
 * folders, which hold no input. Asked for only when `enabled`.
 */
export function useTagForms(enabled: boolean) {
  return useQuery({
    queryKey: ["forms", "tag-forms"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET("/forms", {
        params: {
          query: {
            props: "form_name",
            filter: ["form_type:!eq:folder"],
            orderby: "form_name",
            limit: 0,
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: { form_name?: string }[] = Array.isArray(data.data) ? data.data : [];
      return rows.flatMap((row) =>
        row.form_name === undefined || row.form_name === "" ? [] : [row.form_name],
      );
    },
  });
}
