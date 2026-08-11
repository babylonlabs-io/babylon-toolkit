---
name: dmk-intent-vocabulary
description: "Map developer intent and natural language to the correct Ledger Device Management Kit (DMK) components, operations, and API methods. Use when a developer's request is phrased informally, incompletely, or in terms of outcomes rather than API methods, when the intent is ambiguous and needs mapping to a specific DMK component or operation, or when a developer asks 'how do I...', 'what's the difference between...', or describes a symptom rather than an API."
---

# DMK Intent Vocabulary

This skill translates informal developer requests into the correct DMK components and operations, so the right API is identified before any implementation begins. It is also loaded as a connector by `ledger-dmk-implementation/SKILL.md` when intent is unclear before execution.

---

## Conventions

**Derivation paths are developer-set constants — never user input, never inferred by the agent.** They must appear as literals in the application code (e.g. `"44'/501'/0'/0'"`). If a derivation path is missing from the calling context, stop and ask the developer — do not substitute, default, or guess one. An incorrect path produces a valid-looking result from a different key with no runtime error.

---

## Vocabulary

### Device Discovery

**Phrasings:** "find my Ledger", "detect the hardware wallet", "scan for devices", "Ledger not showing up", "device not found", "USB not detecting", "WebHID not finding anything"

**Maps to:** `dmk.startDiscovering()` — returns `Observable<DiscoveredDevice>`

**Note:** First step before connecting. The developer must subscribe and wait for emissions before connecting.

---

### Device Connection and Session Management

**Phrasings:** "connect to the Ledger", "open a session", "establish connection", "reconnect after disconnect", "get a session ID", "device connected but can't send commands", "how do I disconnect?"

**Maps to:**
- `dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: false } })` — returns `Promise<DeviceSessionId>`
- `dmk.disconnect({ sessionId })`
- `dmk.getConnectedDevice({ sessionId })` — device model and name, informational only

**Note:** The `sessionId` is required for all subsequent interactions.

---

### Device State and Status

**Phrasings:** "is the device locked?", "waiting for PIN", "what app is open?", "device is busy", "observe the device", "listen to device state changes", "battery level", "firmware version without sending a command", "device just disconnected"

**Maps to:** `dmk.getDeviceSessionState({ sessionId })` — returns `Observable<DeviceSessionState>`

**Note:** Emits continuously. Includes device status (`ready`, `busy`, `locked`, `disconnected`), device name, OS info, battery, and currently open app. Prefer this over polling with commands.

---

### App Management

**Phrasings:** "open the Bitcoin app", "launch the Ethereum app", "switch apps", "app not opening", "waiting for user to confirm app launch", "make sure the right app is open before signing", "close the app", "detect which app is running"

**Maps to:**
- `OpenAppDeviceAction` — full flow including user confirmation on device (preferred for user-facing flows)
- `OpenAppCommand` — lower-level direct command
- `CloseAppCommand`
- `GetAppAndVersionCommand` — returns name and version of the running app

---

### Firmware and OS Information

**Phrasings:** "get firmware version", "what OS is on the device?", "MCU version", "bootloader version", "SE version", "is the firmware up to date?"

**Maps to:**
- `GetOsVersionCommand` — returns `seVersion`, `mcuSephVersion`, `mcuBootloaderVersion`
- Or from session state: `dmk.getDeviceSessionState` already includes OS info without an extra command

---

### Raw APDU Commands

**Phrasings:** "send a raw APDU", "low-level command", "custom CLA/INS", "APDU bytes", "the pre-built commands don't cover my use case"

**Maps to:**
- `ApduBuilder` + `dmk.sendApdu({ sessionId, apdu })`
- Or extend `Command` class and use `dmk.sendCommand` (recommended over raw APDU)

**Do not use raw APDU for signing operations.** If the goal is signing and a signer package exists for the chain, use it. Raw APDU bypasses the pre-flight, observable confirmation states, and error classification logic. Only appropriate for non-signing commands or genuinely unsupported chains.

---

### Get Crypto Address

**Phrasings:** "get my Ethereum address", "derive wallet address", "show address on device", "verify address on screen", "public key from Ledger", "get Bitcoin address", "get Solana public key"

**Maps to (by chain):**
- ETH: `signerEth.getAddress(derivationPath, options)`
- BTC: Bitcoin signer equivalent
- Solana: Solana signer equivalent

**Note:** Returns an observable. Use `checkOnDevice: true` for any flow where users are given a receiving address — skipping it means users never see the address on the device screen, the only place they can verify it against a compromised host display.

---

### Sign a Transaction

**Phrasings:** "sign a transaction", "sign ETH tx", "sign and broadcast", "clear signing", "user confirms transaction details on screen", "sign a Bitcoin transaction", "sign Solana transaction", "hardware wallet signing flow", "user rejected the transaction"

**Maps to (by chain):**
- ETH: `signerEth.signTransaction(derivationPath, transaction, options)`
- BTC: Bitcoin signer equivalent
- Solana: Solana signer equivalent

**Note:** Returns an observable. Handle `Pending` states (user action on device) and `Completed` to get the signature. User rejection surfaces as an error state.

---

### Sign a Message (personal_sign)

**Phrasings:** "sign a message", "personal_sign", "prove wallet ownership", "sign to authenticate", "wallet auth flow", "sign text with Ledger"

**Maps to:** `signerEth.signMessage(derivationPath, message)`

**Note:** Prepends `\x19Ethereum Signed Message:\n` before hashing — this prefix is what makes it safe. Different from typed data signing.

**Do not map `eth_sign` to this method.** `eth_sign` signs a raw hash without the safety prefix and is a known phishing vector. If a developer asks for `eth_sign` behavior, flag the security risk before proceeding.

---

### Sign Typed Data (EIP-712)

**Phrasings:** "sign typed data", "EIP-712", "signTypedData_v4", "domain separator", "MetaMask-style signature", "permit signature", "off-chain order"

**Maps to:** `signerEth.signTypedData(derivationPath, typedData)`

**Note:** Requires the typed data object in full (domain + types + message). Used for DeFi permits, off-chain orders, delegation.

---

### Delegation Authorization (EIP-7702)

**Phrasings:** "EIP-7702", "delegation authorization", "sign delegation", "account abstraction signing", "delegate authority to contract"

**Maps to:** `signerEth.signDelegationAuthorization(derivationPath, delegationAuthorization)`

---

### Testing and Debugging

**Phrasings:** "simulate a device", "test without a real Ledger", "mock the hardware wallet", "Speculos", "emulator", "CI testing with Ledger", "device logs", "debug APDU", "unit test DMK"

**Maps to:**
- Speculos transport: `@ledgerhq/device-transport-kit-speculos`
- Developer tools: `DevToolsLogger`, `DevToolsDmkInspector`, WebSocket connector or Rozenite
- React Native: Rozenite connector

**For testing and CI only.** Never configure Speculos, mock transports, or `setStub(true)` in production. They bypass real device interaction — the security model is void.

---

### Common Error States

**Phrasings:** "device locked", "wrong app open", "app not installed", "user rejected", "user cancelled on device", "device disconnected mid-flow", "status word not 9000", "observable never completes", "action stuck in pending", "HID error", "USB permission denied"

**Note:** Most commands reject if the device is locked — check `DeviceSessionState` first. Status word errors (`!= 0x9000`) surface via command parse logic. User rejection surfaces as `DeviceActionStatus.Error`. USB permission denied is a browser security constraint — device access must be triggered from a user gesture.

→ For full error classification and ABORT/ESCALATE routing, load `ledger-dmk-implementation/SKILL.md`.

---

### Genuine Check

**Phrasings:** "verify the device is authentic", "genuine check", "is this Ledger real?", "check device authenticity", "certify device", "is this a real Ledger?"

**Maps to:** `GenuineCheckDeviceAction` via `dmk.executeDeviceAction()`

**Note:** Requires secure channel (HSM backend). Returns `output.isGenuine: boolean`. Prompts `AllowSecureConnection` on first use per device reboot.

---

### List Installed Apps

**Phrasings:** "what apps are on the device?", "list apps", "which apps are installed?", "show installed applications", "check if Ethereum app is installed"

**Maps to:** `ListInstalledAppsDeviceAction` via `dmk.executeDeviceAction()`

**Note:** Returns `output.installedApps: InstalledApp[]`. Requires secure channel.

---

### Install / Uninstall App

**Phrasings:** "install the Ethereum app", "add an app to the Ledger", "remove an app", "uninstall Bitcoin app", "app not installed — install it", "deploy app to device"

**Maps to:**
- Install: `InstallAppDeviceAction` via `dmk.executeDeviceAction()`
- Uninstall: `UninstallAppDeviceAction` via `dmk.executeDeviceAction()`

**Note:** Install emits progress (0–100) in `intermediateValue.progress`. App name must match exactly what Ledger Live uses. Requires secure channel.

→ For secure channel code patterns, load `ledger-dmk-implementation/SKILL.md`.
