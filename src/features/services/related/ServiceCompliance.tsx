import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { ObjectCompliance } from "@/components/opensvc/ObjectCompliance";

/**
 * Whether a service runs encapsulated, in containers having their own compliance:
 * as the historical tab, one of its resources declares the `encap` tag.
 */
function useIsEncapsulated(svcId: string) {
  return useQuery({
    queryKey: ["service", svcId, "compliance", "encap"],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/services/{svc_id}/resinfo", {
        signal,
        params: { path: { svc_id: svcId }, query: { props: "res_key,res_value", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
      return rows.some(
        (row) =>
          row.res_key === "tags" &&
          typeof row.res_value === "string" &&
          row.res_value.split(/[\s,]+/).includes("encap"),
      );
    },
  });
}

/**
 * The compliance of a service, as the historical tab: the modulesets and rulesets
 * attached to it, those of its containers for an encapsulated service, then the
 * last check of each module on each node it runs on.
 */
export function ServiceCompliance({ svcId, locale }: { svcId: string; locale: string }) {
  const encap = useIsEncapsulated(svcId).data === true;
  return (
    <ObjectCompliance
      target={{ kind: "service", id: svcId }}
      locale={locale}
      groupStatusBy="node"
      encap={encap}
    />
  );
}
