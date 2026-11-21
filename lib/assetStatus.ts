// The asset statuses and the rules about them, shared by the server and the screens.
export const STATUSES = ["In Use", "In Store", "Under Maintenance", "Insurance Claim", "Disposed"] as const;
export type Status = (typeof STATUSES)[number];

/** Set only by their own flow (Insurance, Disposal); the asset form can't change them. */
export const LOCKED_STATUSES: Status[] = ["Insurance Claim", "Disposed"];

/** An asset can be given to an employee only from these statuses. */
export const ASSIGNABLE: Status[] = ["In Store", "In Use"];

/**
 * Statuses a person may pick on the form. "In Use" comes only from assigning the asset to an employee,
 * and while someone holds the asset it can't be "In Store" (take it back first).
 */
export function manualStatuses(held: boolean): Status[] {
  return held ? ["In Use"] : ["In Store"];
}

export const STATUS_TONE: Record<Status, "ok" | "neutral" | "warn"> = {
  "In Use": "ok",
  "In Store": "neutral",
  "Under Maintenance": "warn",
  "Insurance Claim": "warn",
  Disposed: "neutral",
};