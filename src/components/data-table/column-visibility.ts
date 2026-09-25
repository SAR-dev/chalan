export const MIN_VISIBLE_COLUMNS = 2

function storageKey(id: string) {
  return `datatable-columns:${id}`
}

export function readVisibleFromStorage(id: string): string[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(storageKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed
    }
  } catch {
    // ignored
  }
  return null
}

export function writeVisibleToStorage(id: string, visible: string[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(visible))
  } catch {
    // ignored
  }
}

function searchColumnsKey(id: string) {
  return `datatable-search-columns:${id}`
}

export function readSearchColumnsFromStorage(id: string): string[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(searchColumnsKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed
    }
  } catch {
    // ignored
  }
  return null
}

export function writeSearchColumnsToStorage(id: string, columns: string[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(searchColumnsKey(id), JSON.stringify(columns))
  } catch {
    // ignored
  }
}
