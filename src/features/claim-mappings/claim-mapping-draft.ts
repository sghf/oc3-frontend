import { teamsOf, type ClaimMappingRow } from "./claim-mapping-api";

/** What the form edits: the rule as the API takes it. */
export interface ClaimMappingDraft {
  claim: string;
  value: string;
  allowAccess: boolean;
  /** Teams granted, none when the rule only allows signing in. */
  groupIds: number[];
}

export const EMPTY_DRAFT: ClaimMappingDraft = {
  claim: "",
  value: "",
  allowAccess: false,
  groupIds: [],
};

export function draftOf(row: ClaimMappingRow | null | undefined): ClaimMappingDraft {
  if (row === null || row === undefined) return EMPTY_DRAFT;
  return {
    claim: row.claim ?? "",
    value: row.value ?? "",
    allowAccess: row.allow_access === "T",
    groupIds: teamsOf(row).map((team) => team.id),
  };
}
