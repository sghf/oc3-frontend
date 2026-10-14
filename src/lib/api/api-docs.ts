import { useQuery } from "@tanstack/react-query";
import { api, API_BASE } from "./client";

/**
 * The address of the API documentation, the Swagger UI oc3 serves at the root of
 * its API path; undefined when it does not serve it (`server.ui.enable` off), as
 * `GET /version` tells (`api_docs`), or until that is known. Read once: it only
 * changes with the configuration of the server.
 */
export function useApiDocsUrl(): string | undefined {
  const version = useQuery({
    queryKey: ["version"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await api.GET("/version");
      if (error !== undefined) throw new Error("version");
      return data;
    },
  });
  return version.data?.api_docs === true ? `${API_BASE}/` : undefined;
}
