---
name: dmk-business-logic
description: "Explain the design rationale and domain concepts behind the Ledger Device Management Kit (DMK) API, including Clear Signing, Secure Channel, Ledger OS (BOLOS), Device Actions vs Commands, sessions, transports, derivation paths, and Genuine Check. Use when a developer asks 'what is X?' about a DMK concept, 'why does X work this way?' about an API design decision, or 'what's the difference between X and Y?' for DMK components."
---

# DMK Business Logic & Concepts

This skill explains the *why* behind DMK API design decisions — domain model, security constraints, and trade-offs — so developers understand the reasoning, not just the calls. It is also loaded as a connector by `ledger-dmk-implementation/SKILL.md` when a term or concept needs clarification during implementation.

---

## Clear Signing vs Blind Signing

### What it means

**Blind signing** means the user sees raw hex bytes on the Ledger screen — a long, unreadable string they cannot verify. They are asked to approve something they cannot meaningfully review.

**Clear Signing** means the user sees human-readable transaction details on the device screen — recipient address, amount, token name, contract name, fee. They can verify what they are actually approving before pressing the button.

### Why it matters

The device screen is the only trusted display. A compromised host (malware, phishing site) can show the user anything on the browser or desktop UI. The device screen cannot be spoofed. Clear Signing makes the device screen meaningful — Blind Signing makes it useless.

### How it works in the DMK

The DMK works fully without Clear Signing — it is an enhancement, not a prerequisite. To enable it for Ethereum:

- **`@ledgerhq/context-module`** must be installed regardless — it is a mandatory peer dependency of the ETH signer kit and handles fetching metadata (ABIs, token info, NFT details) the device needs to display human-readable fields.
- **`originToken`** is an optional partner token passed to `SignerEthBuilder`. Without it, the signer works but the device shows raw hex — the experience silently degrades to blind signing with no runtime error. To obtain a token, enroll in Ledger's partner program: `https://developers.ledger.com/docs/clear-signing/for-wallets`.

```typescript
// Clear Signing enabled (requires partner token):
new SignerEthBuilder({ dmk, sessionId, originToken: "your-partner-token" }).build();

// Blind signing — works but users see raw hex on device:
new SignerEthBuilder({ dmk, sessionId }).build();
```

For Bitcoin and Solana, Clear Signing is handled at the app level — no `originToken` is required, but the Ledger app on device must support the transaction type.

### Developer checklist

- `originToken` is optional — integrate and ship without it, then enroll in Ledger's partner program when ready to enable Clear Signing in production
- Always install `@ledgerhq/context-module` when using the ETH signer kit, even during development
- Always use `checkOnDevice: true` for `getAddress()` flows — this is the address verification equivalent of Clear Signing for receive flows

---

## Secure Channel

### What it is

A Secure Channel is an encrypted, authenticated connection between the Ledger device and Ledger's HSM (Hardware Security Module) backend. It allows the backend to perform privileged operations on the device that cannot be done locally.

### Which operations require it

| Operation | Requires secure channel |
|---|---|
| `GenuineCheckDeviceAction` | Yes |
| `ListInstalledAppsDeviceAction` | Yes |
| `InstallAppDeviceAction` | Yes |
| `UninstallAppDeviceAction` | Yes |
| All signer operations (sign, get address) | No |
| `OpenAppDeviceAction` | No |

### How it works

1. The DMK opens a WebSocket connection to Ledger's HSM at `wss://manager.live.ledger.com`
2. The device and HSM perform a mutual authentication handshake
3. The user is prompted with `AllowSecureConnection` on the device screen — they must physically approve the connection
4. Once approved, the session is trusted for the remainder of that device reboot

### Practical implications

- **Requires internet.** Secure channel operations fail offline — there is no local fallback.

---

## Device Actions vs Commands

### The two-level API

The DMK exposes two levels of device interaction:

**Commands** (`dmk.sendCommand()`) are low-level, single APDU round-trips. They send one instruction to the device and return a result synchronously. No user interaction is handled — the caller is responsible for everything else.

**Device Actions** (`dmk.executeDeviceAction()`, or signer kit methods) are high-level orchestrated flows. They handle the full sequence: unlock detection, app opening, user confirmation prompts, retries, and terminal state emission — all through a single observable.

### When to use each

| Use case | Use |
|---|---|
| Signing a transaction, getting an address | Signer kit device action (via signer builder) |
| Genuine check, app install/uninstall | `dmk.executeDeviceAction()` with the appropriate `DeviceAction` class |
| Opening an app with user confirmation UI | `OpenAppDeviceAction` via `dmk.executeDeviceAction()` |
| Checking firmware version, getting current app name | `sendCommand()` — simple, no user interaction needed |
| Custom/unsupported chain, raw APDU | `sendCommand()` with `ApduBuilder` — only when no signer kit exists |

### Why device actions exist

Without device actions, every developer would have to re-implement:
- Detecting and waiting for device unlock
- Detecting and switching the active app
- Handling the `ConfirmOpenApp` prompt
- Mapping status word errors to user-facing messages
- Managing timeouts and cancellation

Device actions encapsulate all of that. The observable they return emits states that map directly to UI prompts — `UserInteractionRequired.SignTransaction` means "show the user a prompt", `DeviceActionStatus.Completed` means "done, extract output".

---

## Session and SessionId

### What a session is

A session represents an active USB/BLE connection to a specific Ledger device. It is created by `dmk.connect()` and destroyed by `dmk.disconnect()`. The `sessionId` is an opaque string that identifies the session within the DMK instance.

### What a session is not

- It is **not** per-chain. The same `sessionId` works with ETH, BTC, SOL, and any other signer without reconnecting.
- It is **not** an authorization. The device still prompts the user for every signing operation — the session is purely a transport handle.
- It is **not** persistent across page loads. Refreshing the browser destroys the session.

### Session lifespan

A session is valid until:
- `dmk.disconnect({ sessionId })` is called
- The USB cable is unplugged (session state becomes `Disconnected`)
- The browser tab is closed

Do not try to reconnect using an existing `sessionId` — once `Disconnected`, start a new flow from `startDiscovering()`.

### Session refresher

The DMK polls the device periodically to keep session state up to date (current app, device status). This is the session refresher. In multi-tab scenarios where two instances share the same physical device, disable it to avoid conflicting polls:

```typescript
dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } });
```

---

## Transport

### What it abstracts

The transport layer handles the physical communication protocol between the host and the Ledger device. The DMK's API is identical regardless of transport — only the initialization differs.

| Transport | Protocol | Environment |
|---|---|---|
| WebHID | USB HID, 64-byte frames | Browser (Chromium only) |
| WebBLE | Bluetooth GATT | Browser |
| Node-HID | USB HID via native addon | Node.js, Electron |
| React Native HID | USB HID | React Native |
| React Native BLE | Bluetooth | React Native |
| Speculos | TCP socket to emulator | Development/CI only |

### Browser constraints

WebHID requires:
- **Chromium-based browser** (Chrome, Edge, Brave) — Firefox and Safari do not support WebHID
- **HTTPS or localhost** — WebHID is blocked on plain HTTP
- **User gesture** — `startDiscovering()` and `connect()` must be called from a button click or equivalent. Silent failure if called on page load.

### One transport per DMK instance

Each `DeviceManagementKitBuilder` takes one or more transports. In practice, use one. The DMK will attempt transports in registration order.

---

## Derivation Paths

### What they are

A derivation path is a sequence of indices that specifies which key to derive from the root seed stored on the device. Given the same seed phrase, the same path always produces the same key — and a different path produces a completely different key with no runtime error.

### Why they are developer constants, not user input

There is no "wrong path" from the device's perspective — every path produces a valid key. If a user enters a path that differs by even one segment, they get a different address. Funds sent to that address are inaccessible unless the correct path is known. This is a silent, unrecoverable mistake.

Paths must be hardcoded as constants in application code, matching the standard your users' wallets use.

### Path format rules

- **No `m/` prefix.** `DerivationPathUtils.splitPath` parses segments separated by `/`. The leading `m` is not a valid segment — `parseInt("m")` returns `NaN` and throws "invalid number provided". Use `"44'/60'/0'/0/0"` not `"m/44'/60'/0'/0/0"`.
- **Hardened segments** use the `'` suffix (e.g. `44'`). This is shorthand for adding `0x80000000` to the index.
- **Account and index** are separate concepts. `account` selects the wallet (most users use `0`). `index` selects the address within that wallet.

### Standard paths by chain

| Chain | Ledger Live path | Notes |
|---|---|---|
| Ethereum | `44'/60'/0'/0/0` | BIP44, account 0, index 0 |
| Bitcoin Native SegWit | `84'/0'/0'` | BIP84, passed to wallet policy |
| Solana | `44'/501'/0'/0'` | Community standard |
| Cosmos | `44'/118'/0'/0/0` | BIP44 |

For unlisted chains: SLIP-0044 defines coin types (`github.com/satoshilabs/slips/blob/master/slip-0044.md`).

---

## BOLOS

BOLOS (Blockchain Open Ledger Operating System), now known as Ledger OS, is Ledger device's operating system. When no app is open and the device is at the home screen (dashboard), `state.currentApp.name` returns `"BOLOS"`.

This is how you detect that no app is open:

```typescript
const isOnDashboard =
  state.currentApp.name === "BOLOS" || state.currentApp.name === "Dashboard";
```

You do not need to detect this explicitly when using signer kit device actions — they handle app switching automatically. It is useful for pre-operation UX feedback ("no app open, the correct app will open when you proceed").

---

## Genuine Check

A genuine check verifies that a physical Ledger device is authentic hardware manufactured by Ledger, not a counterfeit. It works by having the device prove possession of a private key whose corresponding certificate was signed by Ledger's root CA, verified through the Secure Channel.

It returns `output.isGenuine: boolean`.

**When to use it:** In high-security flows where device authenticity must be established before proceeding — for example, an enterprise key management setup or a first-time device onboarding flow. It is not required for routine signing operations.

**What it does not prove:** It does not prove the device hasn't been tampered with after manufacture, or that the seed phrase is correctly backed up.

---

## Ledger Wallet / Ledger Live

Ledger Live is the previous name for Ledger Wallet — they refer to the same desktop and mobile application. Documentation, skill files, and SDK references may use either name; treat them as identical.

App names used in device actions (`OpenAppDeviceAction`, `InstallAppDeviceAction`, `UninstallAppDeviceAction`) must match exactly what the Ledger app catalog uses — the same names shown in Ledger Wallet. A typo or casing difference causes a silent failure or a cryptic error with no indication of what went wrong.
