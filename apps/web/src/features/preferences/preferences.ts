export type ProductView = 'list' | 'cards';

export const productViewStorageKey = 'nfcompra.product-picker-mode';
export const rememberHouseholdStorageKey = 'nfcompra.remember-household';

export function readProductView(): ProductView {
  try {
    return localStorage.getItem(productViewStorageKey) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

export function writeProductView(view: ProductView): void {
  try {
    localStorage.setItem(productViewStorageKey, view);
  } catch {
    // Browsers can block storage; the in-memory UI state still works.
  }
}

export function readRememberHousehold(): boolean {
  try {
    return localStorage.getItem(rememberHouseholdStorageKey) !== 'off';
  } catch {
    return true;
  }
}

export function writeRememberHousehold(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(rememberHouseholdStorageKey);
    else localStorage.setItem(rememberHouseholdStorageKey, 'off');
  } catch {
    // Browsers can block storage; the in-memory UI state still works.
  }
}
