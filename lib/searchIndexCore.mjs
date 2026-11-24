export const SEARCH_INDEX_VERSION = 4;
export const SEARCH_INDEX_NAME = "asset_search_ngrams_v4";
export const SEARCH_EXACT_INDEX_NAME = "asset_search_exact_terms_v4";
export const SEARCH_EXACT_MAX_TERM_LENGTH = 10;
const MAX_EXACT_FIELD_LENGTH = 128;

function canonicalize(value) {
  return Array.from(value, (character) => character.toUpperCase().toLowerCase()).join("");
}

function grams(value) {
  const characters = Array.from(canonicalize(value));
  const result = new Set();
  for (let size = 1; size <= 4; size++) {
    for (let index = 0; index + size <= characters.length; index++) {
      result.add(characters.slice(index, index + size).join(""));
    }
  }
  return [...result];
}

function exactTerms(values) {
  const result = new Set();
  for (const value of values) {
    const characters = Array.from(value ?? "");
    if (characters.length > MAX_EXACT_FIELD_LENGTH) continue;
    for (let size = 1; size <= Math.min(SEARCH_EXACT_MAX_TERM_LENGTH, characters.length); size++) {
      for (let index = 0; index + size <= characters.length; index++) {
        result.add(`s:${characters.slice(index, index + size).join("")}`);
      }
    }
  }
  return [...result];
}

function assetSearchableFields(asset) {
  return [
    asset.assetTag, asset.name, asset.brand, asset.model, asset.serialNumber, asset.remarks,
  ].map((value) => value ?? "");
}

function searchableText(asset) {
  return assetSearchableFields(asset).join("\n");
}

function assignmentSearchableText(asset) {
  return [
    asset.assetTag,
    asset.name,
    ...(asset.assignments ?? []).map((assignment) => assignment.note),
  ].join("\n");
}

export function assetSearchGrams(asset) {
  return grams(searchableText(asset));
}

export function assetSearchExactTerms(asset) {
  return exactTerms(assetSearchableFields(asset));
}

export function assetSearchHasLongField(asset) {
  return assetSearchableFields(asset).some((value) => Array.from(value).length > MAX_EXACT_FIELD_LENGTH);
}

export function assignmentSearchGrams(asset) {
  if (!asset.assignments?.length) return [];
  const texts = [
    `${asset.assetTag ?? ""}\n${asset.name ?? ""}`,
    ...(asset.assignments ?? []).map((assignment) => assignment.note ?? ""),
  ];
  return [...new Set(texts.flatMap(grams))];
}

export function assignmentSearchExactTerms(asset) {
  if (!asset.assignments?.length) return [];
  return exactTerms([
    asset.assetTag,
    asset.name,
    ...(asset.assignments ?? []).map((assignment) => assignment.note),
  ]);
}

export function assignmentSearchHasLongField(asset) {
  if (!asset.assignments?.length) return false;
  return [asset.assetTag, asset.name, ...(asset.assignments ?? []).map((assignment) => assignment.note)]
    .some((value) => Array.from(value ?? "").length > MAX_EXACT_FIELD_LENGTH);
}

export function assetSearchTextIsAscii(asset) {
  return /^[\x00-\x7F]*$/.test(searchableText(asset));
}

export function assignmentSearchTextIsAscii(asset) {
  return /^[\x00-\x7F]*$/.test(assignmentSearchableText(asset));
}

export function querySearchGrams(term) {
  const characters = Array.from(canonicalize(term));
  const size = Math.min(4, characters.length);
  const result = [];
  for (let index = characters.length - size; index >= 0; index--) {
    result.push(characters.slice(index, index + size).join(""));
  }
  return result;
}

export function querySearchExactTerm(term) {
  return `s:${canonicalize(term)}`;
}

export function querySearchCanSkipRegex(term) {
  const length = Array.from(term).length;
  return length >= 1 && length <= 4 && /^[\x00-\x7F]+$/.test(term);
}
