# DMK SDK Reference

Loaded by Steps 1 and 5 of the DMK Signing Flow skill.

---

## Package Installation

### Always required
```bash
npm install @ledgerhq/device-management-kit rxjs
```

### Transport — pick one per environment
| Environment | Package |
|---|---|
| Browser USB | `@ledgerhq/device-transport-kit-web-hid` |
| Browser Bluetooth | `@ledgerhq/device-transport-kit-web-ble` |
| Node.js USB | `@ledgerhq/device-transport-kit-node-hid` |
| React Native USB | `@ledgerhq/device-transport-kit-react-native-hid` |
| React Native BLE | `@ledgerhq/device-transport-kit-react-native-ble` |
| Simulator (dev/test only) | `@ledgerhq/device-transport-kit-speculos` |

### Signer kit — pick per chain
| Chain | Package |
|---|---|
| Ethereum / EVM | `@ledgerhq/device-signer-kit-ethereum` |
| Bitcoin | `@ledgerhq/device-signer-kit-bitcoin` |
| Solana | `@ledgerhq/device-signer-kit-solana` |
| Cosmos | `@ledgerhq/device-signer-kit-cosmos` |
| Hyperliquid | `@ledgerhq/device-signer-kit-hyperliquid` |
| Aleo | `@ledgerhq/device-signer-kit-aleo` |
| Zcash | `@ledgerhq/device-signer-kit-zcash` |

**Ethereum signer peer dependency — always required:**
```bash
npm install @ledgerhq/context-module
```
`@ledgerhq/context-module` is a peer dependency of `@ledgerhq/device-signer-kit-ethereum` and is imported internally — not only for Clear Signing. Installing the eth signer kit without it causes a build failure (`Module not found: Can't resolve '@ledgerhq/context-module'`). Install it unconditionally when using the Ethereum signer.

---

## Architecture

```
Your App
  └─ Signer Kit (SignerEth / SignerBtc / SignerSolana / …)
       └─ Device Management Kit (DMK)
            └─ Transport (WebHID / WebBLE / NodeHID / RN / Speculos)
                 └─ Ledger Device (Nano S+, Nano X, Stax, Flex)
```

- Signer kits expose high-level operations: `getAddress()`, `signTransaction()`, `signMessage()`, `signTypedData()`
- DMK handles connection, session, state, and command routing
- Every async operation returns `{ observable, cancel }` except `connect()` which returns a `Promise<DeviceSessionId>`
- One DMK instance per application — singleton

---

## Compatible Package Versions

The code patterns and API signatures in this skill are known to work with the following package versions:

| Package | npm name | Known-working version |
|---|---|---|
| Device Management Kit | `@ledgerhq/device-management-kit` | `1.2.0` |
| WebHID Transport | `@ledgerhq/device-transport-kit-web-hid` | `1.2.3` |
| Ethereum Signer Kit | `@ledgerhq/device-signer-kit-ethereum` | `1.12.0` |
| Bitcoin Signer Kit | `@ledgerhq/device-signer-kit-bitcoin` | `1.3.0` |
| Solana Signer Kit | `@ledgerhq/device-signer-kit-solana` | `1.7.1` |

If your `package.json` lists different versions, or if you hit a runtime error that looks like a signature mismatch, re-check the API against the installed package. Always use the npm type definitions as the source of truth — not the GitHub source.

Import the transport identifier from the package, never hardcode the string:
```typescript
import { webHidIdentifier } from "@ledgerhq/device-transport-kit-web-hid";
// webHidIdentifier === "WEB-HID"
```

---

## Chain Routing

| Chain | Device app name | Signer builder |
|---|---|---|
| Ethereum (+ EVM) | `"Ethereum"` | `SignerEthBuilder` |
| Bitcoin | `"Bitcoin"` | `SignerBtcBuilder` |
| Solana | `"Solana"` | `SignerSolanaBuilder` |
| Cosmos | `"Cosmos"` | `SignerCosmosBuilder` |
| Hyperliquid | `"Hyperliquid"` | `SignerHyperliquidBuilder` |
| Aleo | `"Aleo"` | `SignerAleoBuilder` |
| Zcash | `"Zcash"` | `SignerZcashBuilder` |

For chains not listed: check the Ledger device app catalog. The app name must match exactly what Ledger Live uses.

---

## Derivation Paths

Developer-set constants in application code — never user input. These are the canonical values used by Ledger Live.

| Chain | Path | Standard |
|---|---|---|
| Ethereum (Ledger Live) | `44'/60'/{account}'/0/0` | BIP44 |
| Ethereum (MetaMask-style) | `44'/60'/0'/0/{index}` | BIP44 |
| Bitcoin Native SegWit | `84'/0'/{account}'` | BIP84 |
| Bitcoin Nested SegWit | `49'/0'/{account}'` | BIP49 |
| Bitcoin Legacy | `44'/0'/{account}'` | BIP44 |
| Bitcoin Taproot | `86'/0'/{account}'` | BIP86 |
| Solana | `44'/501'/{account}'/0'` | community standard |
| Cosmos | `44'/118'/0'/0/{index}` | BIP44 |

For unlisted chains: SLIP-0044 (`github.com/satoshilabs/slips/blob/master/slip-0044.md`) is the primary source for coin types.

---

## Signer Output Fields

`state.output` is always an object — never a plain string. Extract the field you need.

| Signer | Operation | Output fields |
|---|---|---|
| ETH | `getAddress` | `output.address` (0x…), `output.publicKey` |
| ETH | `signTransaction` | `output.r`, `output.s`, `output.v` |
| ETH | `signMessage` | `output.r`, `output.s`, `output.v` |
| ETH | `signTypedData` | `output.r`, `output.s`, `output.v` |
| BTC | `getExtendedPublicKey` | `output.extendedPublicKey` |
| BTC | `getWalletAddress` | `output.address` |
| BTC | `signMessage` | `output.r`, `output.s`, `output.v` |
| BTC | `getMasterFingerprint` | `output.masterFingerprint` (Uint8Array) |
| Solana | `getAddress` | `output.publicKey` (base58) |
| Solana | `signTransaction` | `output.signature` (Uint8Array) |
| Solana | `signMessage` | `output.signature` (base58) |
| Cosmos | `getAddress` | `output.publicKey` (Uint8Array), `output.address` |

Do not render `state.output` directly in React — it will throw "Objects are not valid as a React child".

---

## Error Types and Status Word Codes

**Do not match errors by `_tag` alone for rejection detection — tags vary by signer kit and command layer.** Use the `isDeviceRejection()` helper in `dmk-code-patterns.md`, which checks both `error.errorCode` and `error.originalError.errorCode` across all known rejection codes.

### User rejection — varies by signer

User rejection is not a single error type. The tag and code depend on which signer kit and which layer surfaces the error:

| Source | `_tag` | `errorCode` | Notes |
|---|---|---|---|
| ETH device action layer | `RefusedByUserDAError` | — | Surfaced by `SignerEthBuilder` actions |
| Global command layer | `ActionRefusedError` | `"5501"` | Surfaced when `GlobalCommandErrorHandler` handles `0x5501` |
| Solana app layer | `SolanaAppCommandError` | `"6982"` | "Security status not satisfied / Canceled by user" |
| Fallback (no matching map) | `UnknownDeviceExchangeError` | nested in `originalError.errorCode` | `0x6985` falls here when not in any map |

Always use `isDeviceRejection()` — do not branch on a single tag or code.

### Other errors

| Error tag | Status word | Meaning | Action |
|---|---|---|---|
| `DeviceLockedError` | `0x5515` | Device is PIN-locked | → ESCALATE |
| — | `0x6807` | App not installed | → ESCALATE |
| — | `0x6a80` | Blind signing not enabled | → ESCALATE |
| — | `0x6e00` | Wrong app open (CLA not supported) | → ABORT, retry after app switch |
| — | `0x6d00` | INS not supported | → ABORT |
| `DeviceDisconnectedWhileSendingError` | — | USB cable pulled mid-operation | → ABORT |
| `SendApduTimeoutError` | — | Command timed out | → ABORT |
| `NoAccessibleDeviceError` | — | User cancelled browser dialog | → ESCALATE |
| `OpeningConnectionError` | — | USB/BLE connection failed | → ABORT, retry |

---

## Concept Map

| Topic | Where to look |
|---|---|
| `DeviceSessionState` shape and discriminated union | `@ledgerhq/device-management-kit` TypeScript types |
| Bitcoin `DefaultDescriptorTemplate` enum casing | `@ledgerhq/device-signer-kit-bitcoin` TypeScript types |
| Signer builder constructor signatures | Each signer kit's TypeScript types |
| Additional chain packages | `device-sdk-ts` packages directory |
| Error type definitions | `@ledgerhq/device-management-kit` error types |

---

## Key Gotchas

- **Never use the `m/` prefix in derivation paths.** `DerivationPathUtils.splitPath` splits on `/` and calls `parseInt` on each segment. `parseInt("m")` returns `NaN`, which throws "invalid number provided" with no indication that the path format is the cause. Use `"44'/60'/0'/0/0"` not `"m/44'/60'/0'/0/0"`. This applies to all chains and all signer kits.
- **Battery status** is unreliable over USB. Only report it for BLE connections.
- **Bitcoin `DefaultDescriptorTemplate`** uses SCREAMING_CASE: `NATIVE_SEGWIT`, `NESTED_SEGWIT`, `LEGACY`, `TAPROOT` — not PascalCase.
- **`UnknownDeviceExchangeError` buries `errorCode` in `originalError`.** When an error code is not in any known map, the DMK wraps it in `UnknownDeviceExchangeError` and puts the code inside `originalError.errorCode`, not at the top level. Always check `error?.errorCode ?? error?.originalError?.errorCode` when classifying. This is how Solana rejection surfaces when the app returns `0x6985` (not in `SOLANA_APP_ERRORS` or `GLOBAL_ERRORS`). Solana also uses `0x6982` ("Security status not satisfied / Canceled by user"), which maps to `SolanaAppCommandError` with `errorCode: "6982"`.
- **Sessions are chain-agnostic.** One `sessionId` works with any signer (ETH, BTC, SOL, Cosmos…) without reconnecting. Build the appropriate signer from the same `sessionId` for each operation — no new session needed when switching chains.
- **Signer instances** must be recreated when `sessionId` changes (reconnection). Do not reuse across sessions.
- **Session refresher** polls the device periodically. Disable it in multi-tab scenarios: `sessionRefresherOptions: { isRefresherDisabled: true }`.
- **Ethereum transactions** must be RLP-encoded as `Uint8Array` before passing to `signTransaction()`.
- **Linux users** may need udev rules: `https://github.com/AUR/ledger-udev-rules`.
- **Secure channel operations** (`GenuineCheckDeviceAction`, `ListInstalledAppsDeviceAction`, `InstallAppDeviceAction`, `UninstallAppDeviceAction`) require a live WebSocket connection to Ledger's HSM backend — not available offline.
- **`AllowSecureConnection`** is prompted once per device reboot when a secure channel operation starts. Subsequent operations in the same session skip it.
- **`transpilePackages` is required in standalone projects.** The DMK sample app lives inside the `device-sdk-ts` monorepo and consumes packages as workspace symlinks (raw TypeScript source), so its `next.config.js` omits `transpilePackages`. A standalone app consuming the published npm packages gets pre-built ESM with no CJS fallback — webpack will fail without `transpilePackages` for all three `@ledgerhq` packages. Do not use the sample app's config as a reference for this setting.
- **`next.config.ts` requires Next.js 15+.** Next.js 14 only accepts `next.config.js` or `next.config.mjs`. Using a `.ts` config file in Next.js 14 throws at build time.
