"use client"

import { useCallback, useState } from "react"
import { DEFAULT_TABLE_ROWS_PER_PAGE } from "@/lib/constants"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"

export interface TableFilters {
  query: string
  page: number
  limit: number
  sortId: string
  sortDir: "asc" | "desc"
  statuses?: string[]
  dateFrom?: string
  dateTo?: string
  [key: string]: string | number | string[] | undefined
}

export interface UseTableFiltersOptions {
  defaultLimit?: number
  defaultSortId?: string
  defaultSortDir?: "asc" | "desc"
}

/**
 * Shared composable for table filter state. Replaces the duplicated
 * useState + useDebouncedValue + onSortChange pattern across all SWR hooks.
 */
export function useTableFilters(options?: UseTableFiltersOptions) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(
    options?.defaultLimit ?? DEFAULT_TABLE_ROWS_PER_PAGE,
  )
  const [sortId, setSortId] = useState<string>(options?.defaultSortId ?? "")
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    options?.defaultSortDir ?? "asc",
  )
  const [statuses, setStatuses] = useState<string[] | undefined>(undefined)
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined)
  const [dateTo, setDateTo] = useState<string | undefined>(undefined)
  const debouncedQuery = useDebouncedValue(query)

  const trimmedQuery = debouncedQuery.trim()
  const offset = (page - 1) * limit

  const onSortChange = useCallback(
    (newSortId: string, newSortDir: "asc" | "desc") => {
      setSortId(newSortId)
      setSortDir(newSortDir)
      setPage(1)
    },
    [],
  )

  const setFilter = useCallback(
    (_key: string, _value: string | number | string[] | undefined) => {
      setPage(1)
    },
    [],
  )

  return {
    query,
    setQuery,
    page,
    setPage,
    limit,
    setLimit,
    sortId,
    setSortId,
    sortDir,
    setSortDir,
    statuses,
    setStatuses,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    debouncedQuery: trimmedQuery,
    offset,
    onSortChange,
    setFilter,
  }
}

export interface BuildTableUrlParams {
  limit?: number
  offset?: number
  q?: string
  statuses?: string[]
  sortId?: string
  sortDir?: string
  dateFrom?: string
  dateTo?: string
  [key: string]: string | number | string[] | undefined
}

/**
 * Builds a query-string URL from filter params. Replaces the duplicated
 * buildUrl() in every SWR hook.
 */
export function buildTableUrl(
  base: string,
  params: BuildTableUrlParams,
): string {
  const sp = new URLSearchParams()
  if (params.limit != null) sp.set("limit", String(params.limit))
  if (params.offset != null) sp.set("offset", String(params.offset))
  if (params.q) sp.set("q", params.q)
  if (params.statuses?.length) sp.set("status", params.statuses.join(","))
  if (params.sortId) sp.set("sort", params.sortId)
  if (params.sortDir) sp.set("sortDir", params.sortDir)
  if (params.dateFrom) sp.set("from", params.dateFrom)
  if (params.dateTo) sp.set("to", params.dateTo)
  // Pass through any extra keys
  for (const [key, value] of Object.entries(params)) {
    if (
      key !== "limit" &&
      key !== "offset" &&
      key !== "q" &&
      key !== "statuses" &&
      key !== "sortId" &&
      key !== "sortDir" &&
      key !== "dateFrom" &&
      key !== "dateTo" &&
      value != null
    ) {
      if (Array.isArray(value)) {
        sp.set(key, value.join(","))
      } else {
        sp.set(key, String(value))
      }
    }
  }
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}
