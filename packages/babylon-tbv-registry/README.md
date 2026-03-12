# @babylonlabs-io/tbv-registry

Client-side registry of verified vault providers for the Babylon TBV frontend.

## Purpose

On-chain vault provider metadata (name, RPC URL) is self-reported and cannot be
trusted for display purposes. This package maintains a curated list of providers
that have been verified by the Babylon team. The frontend uses this registry to:

- Show a **verified badge** next to trusted provider avatars.
- Override on-chain display names and RPC URLs with trusted values.
- Gate provider selection (only verified providers can be selected for deposits).

## Data file

Provider entries live in
[`src/vault-provider/verified-providers.json`](src/vault-provider/verified-providers.json).

Each entry contains:

| Field     | Type   | Required | Description                                |
| --------- | ------ | -------- | ------------------------------------------ |
| `address` | string | yes      | Ethereum address (lowercase, 0x-prefixed)  |
| `name`    | string | yes      | Trusted display name                       |
| `rpcUrl`  | string | yes      | Trusted RPC endpoint URL                   |
| `iconUrl` | string | no       | Trusted icon/logo URL                      |

## Adding or updating a verified provider

1. Open `src/vault-provider/verified-providers.json`.
2. Add a new entry or update an existing one. Ensure the `address` is
   **lowercase** and **0x-prefixed**.
3. Open a PR with the change. The PR description should include:
   - The provider's on-chain registration transaction or address.
   - Confirmation that the RPC URL has been tested and is reachable.
   - Any relevant due-diligence context (e.g. who operates the provider).
4. Get approval from at least one maintainer before merging.

## Removing a provider

Delete the entry from `verified-providers.json` and open a PR. The frontend
will stop showing the verified badge and will fall back to on-chain metadata.

## Usage

```ts
import { getVerifiedProvider } from "@babylonlabs-io/tbv-registry/vault-provider";

const entry = getVerifiedProvider("0xaf8d9d665f4e27f3966a074dce5c50684bfbe358");
if (entry) {
  console.log(entry.name);   // "vault-provider-0"
  console.log(entry.rpcUrl); // "https://rpc.vault-provider-0.vault-devnet.babylonlabs.io"
}
```
