import type { RequestFn } from "./http";

// Types for the actual response format from LCD endpoints
export interface PaginatedResponse<T> {
  pagination: {
    nextKey: string | null;
    total: string;
  };
  [key: string]: T[] | any; // The actual data array will be under a key like 'validators', 'delegations', etc.
}

// Types for the generated protobuf pagination (for reference)
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
  const limit = options.limit || 100; // Default limit
  
  do {
    const params = buildPaginationParams({
      ...options,
      limit,
      key: nextKey || undefined,
    });
    
    const response = await request(endpoint, params) as PaginatedResponse<T>;
    const data = response[dataKey] as T[];
    
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
  
  const response = await request(endpoint, params) as PaginatedResponse<T>;
  const data = response[dataKey] as T[];
  
  return {
    data: data || [],
    pagination: {
      nextKey: response.pagination?.nextKey || null,
      total: parseInt(response.pagination?.total || "0", 10),
    },
  };
}
