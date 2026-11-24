import type { Db, Document } from "mongodb";
import {
  SEARCH_EXACT_MAX_TERM_LENGTH, SEARCH_INDEX_VERSION, querySearchCanSkipRegex,
  querySearchExactTerm, querySearchGrams,
} from "@/lib/searchIndexCore.mjs";
export {
  assetSearchGrams, assetSearchExactTerms, assetSearchHasLongField,
  assignmentSearchGrams, assignmentSearchExactTerms, assignmentSearchHasLongField,
  assetSearchTextIsAscii, assignmentSearchTextIsAscii, querySearchGrams,
  querySearchExactTerm, querySearchCanSkipRegex, SEARCH_INDEX_NAME,
  SEARCH_EXACT_INDEX_NAME, SEARCH_EXACT_MAX_TERM_LENGTH, SEARCH_INDEX_VERSION,
} from "@/lib/searchIndexCore.mjs";

export function indexedSearchMatch(
  gramsField: string,
  asciiField: string,
  term: string,
  exactMatch: Document,
): Document {
  const grams = querySearchGrams(term);
  if (!grams.length) return exactMatch;
  const gramMatch = { [gramsField]: { $all: grams } };
  if (!querySearchCanSkipRegex(term)) return { $and: [gramMatch, exactMatch] };
  return { $or: [
    { $and: [{ [asciiField]: true }, gramMatch] },
    { $and: [{ [asciiField]: { $ne: true } }, gramMatch, exactMatch] },
  ] };
}

export function indexedSubstringMatch(
  gramsField: string,
  asciiField: string,
  exactTermsField: string,
  longField: string,
  term: string,
  exactMatch: Document,
): Document {
  const length = Array.from(term).length;
  const grams = querySearchGrams(term);
  const gramMatch = { [gramsField]: { $all: grams } };
  if (!/^[\x00-\x7F]+$/.test(term)) {
    return indexedSearchMatch(gramsField, asciiField, term, exactMatch);
  }

  const exactPrefix = Array.from(term).slice(0, SEARCH_EXACT_MAX_TERM_LENGTH).join("");
  const exactTermMatch: Document = { [exactTermsField]: querySearchExactTerm(exactPrefix) };
  const candidates: Document[] = [
    length <= SEARCH_EXACT_MAX_TERM_LENGTH
      ? { $and: [{ [asciiField]: true }, exactTermMatch] }
      : { $and: [{ [asciiField]: true }, exactTermMatch, exactMatch] },
    { $and: [{ [asciiField]: { $ne: true } }, exactTermMatch, exactMatch] },
    { $and: [{ [longField]: true }, gramMatch, exactMatch] },
  ];
  return { $or: candidates };
}

export async function assetSearchIndexState(database: Db) {
  const state = await database.collection<Document & { _id: string }>("appMeta").findOne({
    _id: "assetSearch", ready: true, version: SEARCH_INDEX_VERSION,
  }, { projection: { _id: 1, categoryRefsValid: 1 } });
  return { ready: !!state, categoryRefsValid: state?.categoryRefsValid === true };
}

export async function assetSearchIndexReady(database: Db) {
  return (await assetSearchIndexState(database)).ready;
}
