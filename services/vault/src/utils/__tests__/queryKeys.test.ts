import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { invalidateVaultQueries } from "../queryKeys";

function seed(client: QueryClient, key: unknown[]): void {
  client.setQueryData(key, "cached");
}

const CHECKSUMMED = "0xAbC0000000000000000000000000000000000001";

describe("invalidateVaultQueries", () => {
  it("invalidates the position query whatever the rest of its key holds", async () => {
    const client = new QueryClient();
    const positionKey = [
      "aaveUserPosition",
      CHECKSUMMED,
      "0xspoke",
      "3",
      ["7"],
    ];
    seed(client, positionKey);

    await invalidateVaultQueries(client);

    expect(client.getQueryState(positionKey)?.isInvalidated).toBe(true);
  });

  it("invalidates the vaults query", async () => {
    const client = new QueryClient();
    const vaultsKey = ["vaults", CHECKSUMMED];
    seed(client, vaultsKey);

    await invalidateVaultQueries(client);

    expect(client.getQueryState(vaultsKey)?.isInvalidated).toBe(true);
  });

  it("leaves unrelated queries alone", async () => {
    const client = new QueryClient();
    const priceKey = ["prices", "BTC"];
    seed(client, priceKey);

    await invalidateVaultQueries(client);

    expect(client.getQueryState(priceKey)?.isInvalidated).toBe(false);
  });
});
