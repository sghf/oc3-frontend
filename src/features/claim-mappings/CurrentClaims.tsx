import { useTranslation } from "react-i18next";
import { PlusIcon } from "@/components/ui/icons";
import { flattenClaims, useCurrentClaims } from "./claim-mapping-api";

/**
 * The claims of the current sign-in, as the identity provider sent them: what a
 * rule can match, each value with a button starting a rule from it. Only an OpenID
 * Connect sign-in has any; the section says so otherwise.
 */
export function CurrentClaims({ onMap }: { onMap: (claim: string, value: string) => void }) {
  const { t } = useTranslation();
  const claims = useCurrentClaims();
  const entries = flattenClaims(claims.data?.claims ?? {});
  const oidc = claims.data?.source === "session" || claims.data?.source === "bearer";

  return (
    <details className="mb-3 rounded-(--radius-panel) border border-line bg-surface-raised">
      <summary className="cursor-pointer px-3 py-2 font-medium">
        {t("claimMappings.current.title")}
      </summary>
      <div className="border-t border-line px-3 py-2">
        {claims.isPending && <p className="text-ink-muted">{t("detail.loading")}</p>}
        {claims.isError && (
          <p role="alert" className="text-state-down">
            ■ {claims.error.message}
          </p>
        )}
        {claims.isSuccess && !oidc && (
          <p className="text-ink-muted">{t("claimMappings.current.notOidc")}</p>
        )}
        {claims.isSuccess && oidc && entries.length === 0 && (
          <p className="text-ink-muted">{t("claimMappings.current.none")}</p>
        )}
        {entries.length > 0 && (
          <>
            <p className="mb-2 text-ink-muted">{t("claimMappings.current.intro")}</p>
            <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 text-data">
              {entries.map(([name, values]) => (
                <div key={name} className="contents">
                  <dt className="font-mono text-ink-muted">{name}</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {values.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          onMap(name, value);
                        }}
                        title={t("claimMappings.current.map", { claim: name, value })}
                        className="flex h-6 items-center gap-1 rounded-full border border-line bg-surface px-2 font-mono hover:border-accent hover:text-ink"
                      >
                        {value}
                        <PlusIcon className="h-3 w-3 text-ink-muted" />
                        <span className="sr-only">
                          {t("claimMappings.current.map", { claim: name, value })}
                        </span>
                      </button>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </details>
  );
}
