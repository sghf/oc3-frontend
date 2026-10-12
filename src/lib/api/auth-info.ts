import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { problemText } from "./problem";

/**
 * The sign-in modes the collector offers (`GET /auth/info`, public): whether it
 * still accepts collector passwords (`basic`), and its OpenID Connect sign-in.
 */
export function useAuthInfo() {
  return useQuery({
    queryKey: ["auth", "info"],
    queryFn: async () => {
      const { data, error } = await api.GET("/auth/info");
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
    // The provider may become reachable while the screen is open.
    refetchInterval: (query) =>
      query.state.data?.oidc.enabled === true && !query.state.data.oidc.ready ? 10_000 : false,
  });
}
