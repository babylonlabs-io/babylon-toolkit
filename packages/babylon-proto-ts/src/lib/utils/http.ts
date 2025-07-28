class ServerError extends Error {
  constructor(
    private readonly code: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type SearchParams =
  | string[][]
  | Record<string, string>
  | string
  | URLSearchParams;

export type RequestFn = <R = any>(
  path: string,
  params?: SearchParams,
) => Promise<R>;

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

export function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
}

export function convertKeysDeep(
  obj: any,
  convertFn: (key: string) => string,
): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeysDeep(item, convertFn));
  } else if (obj !== null && typeof obj === "object") {
    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      newObj[convertFn(key)] = convertKeysDeep(value, convertFn);
    }
    return newObj;
  }
  return obj;
}

export function createRequest(host: string): RequestFn {
  return async <R = any>(path: string, params?: SearchParams): Promise<R> => {
    const searchParams = params ? `?${new URLSearchParams(params)}` : "";
    const url = `${host}${path}${searchParams}`;

    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok) {
      throw new ServerError(
        response.status,
        json?.message ?? "Unknown Server Error",
      );
    }

    return convertKeysDeep(json, toCamelCase);
  };
}
