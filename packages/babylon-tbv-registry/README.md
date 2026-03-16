# @babylonlabs-io/tbv-registry

Client-side registry of trusted vault providers.

## Adding/Updating Providers

Edit `src/vault-provider/verified-providers.json`:

```json
{
  "address": "0x...",
  "name": "Provider Name",
  "rpcUrl": "https://...",
  "iconUrl": "https://...",
  "active": true
}
```

- `address` — Ethereum address (lowercase, 0x-prefixed)
- `name` — Display name shown in the UI
- `rpcUrl` — Trusted RPC endpoint (overrides on-chain value)
- `iconUrl` — Optional icon URL
- `active` — Whether the provider is currently online and operational

Providers in this list are shown as "verified" in the UI. Set `active: true` for providers that have been tested and are confirmed operational.
