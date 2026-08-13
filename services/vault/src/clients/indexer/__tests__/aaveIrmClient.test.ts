import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { GRAPHQL_ENDPOINT: "https://indexer.test" },
}));
vi.mock("../../../config/env", () => ({
  ENV: mockEnv,
}));

const mockFetch = vi.fn();

beforeAll(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  mockFetch.mockReset();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    reserveId: "1",
    kinkUtilizationPercent: 80,
    maxAprPercent: 64,
    points: [
      { utilizationPercent: 0, aprRay: "0", aprPercent: 0 },
      {
        utilizationPercent: 80,
        aprRay: "40000000000000000000000000",
        aprPercent: 4,
      },
      {
        utilizationPercent: 100,
        aprRay: "640000000000000000000000000",
        aprPercent: 64,
      },
    ],
    ...overrides,
  };
}

describe("fetchIrmCurve", () => {
  beforeEach(() => {
    mockEnv.GRAPHQL_ENDPOINT = "https://indexer.test";
  });

  it("builds the request URL from a bare-origin endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(validPayload()));
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await fetchIrmCurve({ reserveId: 7n });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://indexer.test/api/aave/reserves/7/irm",
      expect.anything(),
    );
  });

  it("parses a valid payload into an IrmCurve, dropping aprRay", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(validPayload()));
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    const result = await fetchIrmCurve({ reserveId: 1n });

    expect(result).toEqual({
      curve: [
        { utilizationPercent: 0, aprPercent: 0 },
        { utilizationPercent: 80, aprPercent: 4 },
        { utilizationPercent: 100, aprPercent: 64 },
      ],
      kinkUtilizationPercent: 80,
      maxAprPercent: 64,
    });
  });

  it("forwards the abort signal to fetch — aborting the caller signal aborts the in-flight request", async () => {
    let capturedSignal: AbortSignal | undefined;
    mockFetch.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          capturedSignal = init.signal;
          init.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const { fetchIrmCurve } = await import("../aaveIrmClient");
    const controller = new AbortController();

    const promise = fetchIrmCurve({ reserveId: 1n, signal: controller.signal });
    expect(capturedSignal?.aborted).toBe(false);

    controller.abort();

    await expect(promise).rejects.toThrow(/Aborted/);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("throws a named error on a non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 502));
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(
      /aave\/reserves\/1\/irm.*failed with status 502/,
    );
  });

  it("throws a parse error — not a network-failure message — on a malformed JSON body", async () => {
    mockFetch.mockResolvedValueOnce(new Response("not-json{", { status: 200 }));
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(
      /is not valid JSON/,
    );
  });

  it("throws when points is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(validPayload({ points: undefined })),
    );
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(/points/);
  });

  it("throws when points is empty — an empty curve is a contract violation", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(validPayload({ points: [] })));
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(
      /empty "points"/,
    );
  });

  it("throws when kinkUtilizationPercent is not a finite number", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(validPayload({ kinkUtilizationPercent: "80" })),
    );
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(
      /kinkUtilizationPercent/,
    );
  });

  it("throws when maxAprPercent is not a finite number", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(validPayload({ maxAprPercent: Number.NaN })),
    );
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(
      /maxAprPercent/,
    );
  });

  it("throws when a point's aprPercent is not a finite number", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        validPayload({
          points: [{ utilizationPercent: 0, aprRay: "0", aprPercent: "0" }],
        }),
      ),
    );
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(
      /aprPercent/,
    );
  });

  it("throws when a point's utilizationPercent is not a finite number", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        validPayload({
          points: [
            { utilizationPercent: Number.NaN, aprRay: "0", aprPercent: 0 },
          ],
        }),
      ),
    );
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(
      /utilizationPercent/,
    );
  });

  it("throws when a point's aprRay is missing or not a string", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        validPayload({
          points: [{ utilizationPercent: 0, aprPercent: 0 }],
        }),
      ),
    );
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(/aprRay/);
  });

  it("throws a named error when fetch itself rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const { fetchIrmCurve } = await import("../aaveIrmClient");

    await expect(fetchIrmCurve({ reserveId: 1n })).rejects.toThrow(
      /indexer\.test/,
    );
  });
});
