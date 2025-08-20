import type { RequestFn } from "./http";

const DEFAULT_PAGINATION_LIMIT = 100;
export interface PageRequest {
  key: Uint8Array;
  offset: number;
  limit: number;
  countTotal: boolean;
  reverse: boolean;
}

export interface PageResponse {
  nextKey: Uint8Array;
  total: number;
}

// Options for paginated requests
export interface PaginationOptions {
  limit?: number;
  key?: string;
  countTotal?: boolean;
  reverse?: boolean;
}

// Result of a paginated request
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    nextKey: string | null;
    total: number;
  };
}

// Helper to convert pagination options to query parameters
export function buildPaginationParams(options: PaginationOptions = {}): Record<string, string> {
  const params: Record<string, string> = {};
  
  if (options.limit !== undefined) {
    params.limit = options.limit.toString();
  }
  
  if (options.key !== undefined && options.key !== '') {
    params.key = options.key;
  }
  
  if (options.countTotal !== undefined) {
    params.count_total = options.countTotal.toString();
  }
  
  if (options.reverse !== undefined) {
    params.reverse = options.reverse.toString();
  }
  
  return params;
}

// Generic function to fetch all pages of a paginated endpoint
export async function fetchAllPages<T>(
  request: RequestFn,
  endpoint: string,
  dataKey: string,
  options: PaginationOptions = {}
): Promise<T[]> {
  const allData: T[] = [];
  let nextKey: string | null = options.key || null;
  const limit = options.limit || DEFAULT_PAGINATION_LIMIT;
  
  do {
    const params = buildPaginationParams({
      ...options,
      limit,
      key: nextKey || undefined,
    });
    
    const response = await request(endpoint, params);
    const data = response[dataKey];
    
    if (data && Array.isArray(data)) {
      allData.push(...data);
    }
    
    nextKey = response.pagination?.nextKey || null;
  } while (nextKey !== null);
  
  return allData;
}

// Generic function to fetch a single page
export async function fetchPage<T>(
  request: RequestFn,
  endpoint: string,
  dataKey: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<T>> {
  const params = buildPaginationParams(options);
  
  const response = await request(endpoint, params);
  const data = response[dataKey];
  
  return {
    data: data || [],
    pagination: {
      nextKey: response.pagination?.nextKey || null,
      total: parseInt(response.pagination?.total || "0", 10),
    },
  };
}
