export const activeHouseholdStorageKey = 'nfcompra.active-household-id';

export function readActiveHouseholdId(): string | null {
  try {
    return localStorage.getItem(activeHouseholdStorageKey);
  } catch {
    return null;
  }
}

export function writeActiveHouseholdId(householdId: string | null): void {
  try {
    if (householdId) localStorage.setItem(activeHouseholdStorageKey, householdId);
    else localStorage.removeItem(activeHouseholdStorageKey);
  } catch {
    // Browsers can block storage; the in-memory UI state still works.
  }
}
