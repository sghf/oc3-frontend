import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toTagRows, type TagRow } from "./tag-row";

/**
 * Every tag, keyed by its `tag_id`.
 *
 * The whole list is read — a collector counts tens of tags, not thousands — and
 * cached, so that opening several tags from the panels costs a single request;
 * `GET /tags/{tag_id}`, which takes the `tag_id` the badges carry, would cost one
 * per tag.
 */
function useTagsById() {
  return useQuery({
    queryKey: ["tags", "by-id"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET("/tags", {
        params: {
          query: { props: "tag_id,tag_name,tag_exclude,tag_data,tag_created", limit: 0 },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return new Map(toTagRows(data.data).map((row) => [row.tag_id, row]));
    },
  });
}

/** One tag by its `tag_id`; `null` once loaded when the collector has no such tag. */
export function useTag(tagId: string | undefined) {
  const tags = useTagsById();
  const tag: TagRow | null | undefined =
    tagId === undefined || tags.data === undefined ? undefined : (tags.data.get(tagId) ?? null);
  return {
    tag,
    isPending: tagId !== undefined && tags.isPending,
    errorMessage: tags.isError ? tags.error.message : null,
  };
}
