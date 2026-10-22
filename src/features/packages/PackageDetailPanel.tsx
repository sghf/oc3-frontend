import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";

type PackageRow = components["schemas"]["PackageRow"];

const text = (prop: keyof PackageRow) => (row: PackageRow) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const field = (prop: keyof PackageRow) => ({ prop, format: text(prop) });

const date = (prop: "pkg_install_date" | "pkg_updated") => ({
  prop,
  format: (row: PackageRow) => {
    // The install date is null when the package manager does not record it.
    const value = row[prop];
    return value === undefined || value === null || value === ""
      ? undefined
      : formatDateTime(value);
  },
});

/**
 * Detail of an installed package, read-only as the agents report it: the package,
 * its signature, the node it is installed on, then the dates.
 */
const GROUPS: DetailGroup<PackageRow>[] = [
  {
    key: "package",
    family: "package",
    fields: [field("pkg_name"), field("pkg_version"), field("pkg_arch"), field("pkg_type")],
  },
  {
    key: "signature",
    family: "security",
    fields: [
      // A key id, compared character by character.
      { ...field("pkg_sig"), render: (row) => <code>{row.pkg_sig}</code> },
      field("sig_provider"),
    ],
  },
  {
    key: "node",
    family: "node",
    fields: [
      linkedField<PackageRow>(
        "nodes.nodename",
        "node",
        (row) => row.node_id,
        text("nodes.nodename"),
      ),
      field("node_id"),
      linkedField<PackageRow>(
        "nodes.app",
        "app",
        (row) => text("nodes.app")(row),
        text("nodes.app"),
      ),
      field("nodes.os_name"),
    ],
  },
  {
    key: "record",
    family: "time",
    fields: [date("pkg_install_date"), date("pkg_updated"), field("id")],
  },
];

const PROPS = [
  "id",
  "node_id",
  "nodes.nodename",
  "nodes.app",
  "nodes.os_name",
  "pkg_name",
  "pkg_version",
  "pkg_arch",
  "pkg_type",
  "pkg_sig",
  "sig_provider",
  "pkg_install_date",
  "pkg_updated",
].join(",");

/** A package installed on a node, from its row in the list. */
export function PackageDetailPanel({
  pkgId,
  label,
  onClose,
}: {
  pkgId: string | undefined;
  /** What the row says of the package, shown while the panel reads it. */
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    data: pkg,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["package", pkgId],
    enabled: pkgId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/packages/{pkg_id}", {
        params: { path: { pkg_id: Number(pkgId) }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: PackageRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const name = [pkg?.pkg_name, pkg?.["nodes.nodename"]]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ");

  return (
    <DetailPanel
      kind="package"
      open={pkgId !== undefined}
      title={name !== "" ? name : label === "" ? t("packages.detail.title") : label}
      onClose={onClose}
      groups={GROUPS}
      row={pkg}
      labelPrefix="packages.fields"
      groupPrefix="packages.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
    />
  );
}
