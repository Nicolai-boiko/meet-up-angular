export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

export function parsePagination(query: { page?: string; limit?: string }): {
  page: number
  limit: number
  skip: number
} {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20))
  return { page, limit, skip: (page - 1) * limit }
}
