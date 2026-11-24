import type { AssetDoc, AssignmentDoc } from "./db";

type AssignmentSearchInput = Pick<AssetDoc, "assetTag" | "name"> & {
  assignments: Pick<AssignmentDoc, "note">[];
};

export const SEARCH_INDEX_VERSION: 4;
export const SEARCH_INDEX_NAME: "asset_search_ngrams_v4";
export const SEARCH_EXACT_INDEX_NAME: "asset_search_exact_terms_v4";
export const SEARCH_EXACT_MAX_TERM_LENGTH: 10;

type AssetSearchInput = Pick<
  AssetDoc,
  "assetTag" | "name" | "brand" | "model" | "serialNumber" | "remarks"
>;

export function assetSearchGrams(asset: AssetSearchInput): string[];
export function assetSearchExactTerms(asset: AssetSearchInput): string[];
export function assetSearchHasLongField(asset: AssetSearchInput): boolean;

export function assignmentSearchGrams(asset: AssignmentSearchInput): string[];
export function assignmentSearchExactTerms(asset: AssignmentSearchInput): string[];
export function assignmentSearchHasLongField(asset: AssignmentSearchInput): boolean;

export function assetSearchTextIsAscii(asset: Pick<
  AssetDoc,
  "assetTag" | "name" | "brand" | "model" | "serialNumber" | "remarks"
>): boolean;

export function assignmentSearchTextIsAscii(asset: AssignmentSearchInput): boolean;

export function querySearchGrams(term: string): string[];
export function querySearchExactTerm(term: string): string;
export function querySearchCanSkipRegex(term: string): boolean;
