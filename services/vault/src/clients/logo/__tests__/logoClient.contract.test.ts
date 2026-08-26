/**
 * Live contract test against a real deployed sidecar. Opt-in: skipped unless
 * LIVE_SIDECAR_API_URL is set, so CI stays offline and deterministic.
 *
 *   LIVE_SIDECAR_API_URL=https://sidecar-api.canon-devnet.babylonlabs.io \
 *     pnpm exec vitest run src/clients/logo/__tests__/logoClient.contract.test.ts
 *
 * Exists because this feature shipped broken for five months: the client parsed
 * a flat map while the sidecar has always wrapped responses in
 * { data: { images } }, and the unit tests mocked the client's assumption, so
 * both stayed green. This test is the only one that fails when the two sides
 * genuinely disagree.
 */
import { describe, expect, it, vi } from "vitest";

const LIVE_URL = process.env.LIVE_SIDECAR_API_URL;

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { SIDECAR_API_URL: "" },
}));
vi.mock("../../../config/env", () => ({
  ENV: mockEnv,
}));

// A syntactically valid identity (64-hex BTC pubkey); the sidecar validates the
// format, and an unknown key simply yields no image for it.
const PROBE_IDENTITY =
  "1db08a1171aa6adfc73c18f58f99bf2699cee76708b7c9eb23859631b4d0008e";

describe.runIf(Boolean(LIVE_URL))("sidecar /logo contract (live)", () => {
  it("responds with the { data: { images } } envelope", async () => {
    const response = await fetch(`${LIVE_URL}/logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identities: [PROBE_IDENTITY] }),
    });

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty("data.images");
    expect(typeof body.data.images).toBe("object");
  });

  it("fetchLogos returns exactly the envelope's images map", async () => {
    mockEnv.SIDECAR_API_URL = LIVE_URL as string;
    const { fetchLogos } = await import("../logoClient");

    const raw = await fetch(`${LIVE_URL}/logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identities: [PROBE_IDENTITY] }),
    });
    const expected = (await raw.json()).data.images;

    const result = await fetchLogos([PROBE_IDENTITY]);

    expect(result).toEqual(expected);
  });
});
