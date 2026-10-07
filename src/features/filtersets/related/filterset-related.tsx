import type { RelatedTab } from "@/components/opensvc/related-tabs";
import { ColumnFamilyIcon } from "@/components/opensvc/ColumnFamily";
import { useFiltersetMatches } from "../filterset-api";
import { FiltersetNodes, FiltersetServices } from "./FiltersetObjects";

/**
 * The objects a filterset selects, one tab per kind, counted over the whole
 * selection whatever the list shows.
 */
export const FILTERSET_RELATED_TABS: RelatedTab[] = [
  {
    key: "nodes",
    labelKey: "filtersets.related.nodes",
    icon: <ColumnFamilyIcon family="node" />,
    useSummary: (id) => ({ count: useFiltersetMatches(id).data?.nodes }),
    render: (id, locale) => <FiltersetNodes filtersetId={id} locale={locale} />,
  },
  {
    key: "services",
    labelKey: "filtersets.related.services",
    icon: <ColumnFamilyIcon family="service" />,
    useSummary: (id) => ({ count: useFiltersetMatches(id).data?.services }),
    render: (id) => <FiltersetServices filtersetId={id} />,
  },
];
