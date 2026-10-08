import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FlashScope } from "@/components/opensvc/Flash";
import type { components } from "@/lib/api/schema";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { DateTime } from "@/components/ui/DateTime";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { SearchBox } from "@/components/ui/SearchBox";
import { matchesSearch } from "@/lib/search-match";
import { useNodePackages } from "./queries";

type PackageRow = components["schemas"]["PackageRow"];

/**
 * Packages installed on the node, as its agent reports them, by name. A node counts
 * a couple of thousand of them: a search narrows the list as it is typed, on the
 * name and the version, and a link opens the Packages view on this node for the
 * column filters and sorts.
 */
export function NodePackages({
  nodeId,
  locale,
  headerTop,
}: {
  nodeId: string;
  locale: string;
  /** Where the table header sticks, see `RelatedTable`. */
  headerTop?: string;
}) {
  const { t } = useTranslation();
  const packages = useNodePackages(nodeId);
  const [query, setQuery] = useState("");
  const all = packages.data ?? [];
  const needle = query.trim().toLowerCase();
  const rows = all.filter((row) => matchesSearch(needle, row.pkg_name, row.pkg_version));

  const columns: RelatedColumn<PackageRow>[] = [
    {
      key: "pkg_name",
      label: t("packages.fields.pkg_name"),
      render: (row) => row.pkg_name,
      wrap: true,
    },
    {
      key: "pkg_version",
      label: t("packages.fields.pkg_version"),
      // Versions run long ("4.0.1really4.0.1-0ubuntu0.24.04.7"): they may break anywhere.
      render: (row) => <code className="break-all">{row.pkg_version}</code>,
      grow: true,
    },
    { key: "pkg_arch", label: t("packages.fields.pkg_arch"), render: (row) => row.pkg_arch },
    { key: "pkg_type", label: t("packages.fields.pkg_type"), render: (row) => row.pkg_type },
    // Only when a package names the provider of its key: most report no signature.
    ...(all.some((row) => (row.sig_provider ?? "") !== "")
      ? [
          {
            key: "sig_provider",
            label: t("packages.fields.sig_provider"),
            render: (row: PackageRow) => row.sig_provider,
          },
        ]
      : []),
    {
      key: "pkg_install_date",
      label: t("packages.fields.pkg_install_date"),
      render: (row) =>
        row.pkg_install_date === undefined ||
        row.pkg_install_date === null ||
        row.pkg_install_date === "" ? null : (
          <DateTime value={row.pkg_install_date} locale={locale} dateOnly />
        ),
    },
  ];

  // The whole list comes from the same push of the agent: its date is said once.
  const updated = all.reduce<string | undefined>(
    (latest, row) =>
      row.pkg_updated !== undefined && (latest === undefined || row.pkg_updated > latest)
        ? row.pkg_updated
        : latest,
    undefined,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={query} onChange={setQuery} label={t("nodes.packages.search")} />
        {packages.isSuccess && (
          <p role="status" className="text-ink-muted tabular-nums">
            {needle === ""
              ? t("nodes.packages.count", { count: all.length })
              : t("nodes.packages.matching", { count: rows.length, total: all.length })}
          </p>
        )}
        <Link
          to="/packages"
          search={{ "f.node_id": `eq:${nodeId}` }}
          className="ml-auto text-accent hover:underline"
        >
          {t("nodes.packages.openView")}
        </Link>
      </div>
      {updated !== undefined && (
        <p className="text-ink-muted">
          {t("nodes.packages.reported")} <RelativeTime value={updated} locale={locale} />
        </p>
      )}
      {/* Rows a search brings back are no live update: they do not flash. */}
      <FlashScope subject={needle}>
        <RelatedTable
          columns={columns}
          groups={[{ key: "packages", label: t("nodes.related.packages"), rows }]}
          rowKey={(row) => String(row.id ?? `${row.pkg_name ?? ""}:${row.pkg_arch ?? ""}`)}
          isPending={packages.isPending}
          errorMessage={packages.isError ? packages.error.message : null}
          empty={needle === "" ? t("nodes.packages.empty") : t("nodes.packages.noMatch")}
          caption={t("nodes.related.packages")}
          headerTop={headerTop}
        />
      </FlashScope>
    </div>
  );
}
