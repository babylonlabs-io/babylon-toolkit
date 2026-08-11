# DMK Code Patterns

Concrete, working code patterns for DMK integration. Loaded by Steps 1, 2, and 5 of the DMK Signing Flow skill.

For platform-specific wiring (React, Node.js CLI, Vite, EIP-1193), see `dmk-platform-patterns.md`.

---

## DMK Initialization

### Non-React (browser or Node.js singleton)
```typescript
import { DeviceManagementKitBuilder } from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";

export const dmk = new DeviceManagementKitBuilder()
  .addTransport(webHidTransportFactory)
  .build();
```

**For React apps:** do NOT use a module-level singleton. Use the React Context Provider in `dmk-platform-patterns.md` — creating both causes two DMK instances.

**For Node.js apps:** create only one instance per process. Each `nodeHidTransportFactory` registers USB hotplug listeners — multiple instances stack them up.

### Builder API
| Method | Description |
|---|---|
| `.addTransport(factory)` | Add a transport (at least one required) |
| `.addLogger(logger)` | Add a logger (`ConsoleLogger` or custom) |
| `.addConfig(partial)` | Partial config: `managerApiUrl`, `provider`, etc. |
| `.setStub(boolean)` | Stub mode — testing only, never production |
| `.build()` | Returns the `DeviceManagementKit` instance |

---

## Device Discovery and Connection

### Simplest pattern — single device, promise-based
```typescript
import { firstValueFrom } from "rxjs";

async function connectDevice() {
  const device = await firstValueFrom(
    dmk.startDiscovering({ transport: "WEB-HID" })
  );
  const sessionId = await dmk.connect({ device });
  return sessionId;
}
```

`startDiscovering()` must be called from a user gesture (button click) in browser contexts — never on page load.

### Observable pattern — for UI with live device list
```typescript
const sub = dmk.startDiscovering({ transport: "WEB-HID" }).subscribe({
  next: (device) => {
    // device: { id, name, deviceModel, transport }
    sub.unsubscribe(); // WebHID: picker guarantees one device
    dmk.connect({ device }).then((sessionId) => { /* store sessionId */ });
  },
  error: (err) => console.error("Discovery failed:", err),
});

// Stop discovery:
sub.unsubscribe();
```

### Connect with options
```typescript
const sessionId = await dmk.connect({
  device,
  sessionRefresherOptions: {
    isRefresherDisabled: false,
    pollingInterval: 3000,
  },
});
```

### Disconnect
```typescript
await dmk.disconnect({ sessionId });
```

### Listen for new connections (passive)
```typescript
dmk.listenToConnectedDevice().subscribe((connectedDevice) => {
  console.log("New connection:", connectedDevice.sessionId);
});
```

### listenToAvailableDevices — passive device watch (CLI / Node.js)

Different from `startDiscovering`: does **not** trigger a browser picker or USB dialog. Emits the current list of already-known/paired devices and updates reactively when devices are added or removed.

```typescript
// Returns Observable<DiscoveredDevice[]> — emits on every change to the available device list
dmk.listenToAvailableDevices({}).subscribe((devices) => {
  if (devices.length > 0) {
    dmk.connect({ device: devices[0]! }).then((sessionId) => { /* … */ });
  }
});
```

Use `listenToAvailableDevices` in CLI and Node.js contexts (no browser picker available). Use `startDiscovering` in browser contexts where the user must grant permission via the OS dialog.

### Locked device at connection — wait-in-place pattern

Use in UI contexts where you want to stay subscribed and wait. For agentic contexts, use the `ESCALATE` path in the process skill instead — autonomous waiting bypasses the HITL gate.

```typescript
import { firstValueFrom, filter, take } from "rxjs";
import { DeviceStatus } from "@ledgerhq/device-management-kit";

async function connectWithRetry(dmk: DeviceManagementKit, transport: string) {
  const device = await firstValueFrom(dmk.startDiscovering({ transport }));
  try {
    return await dmk.connect({ device });
  } catch (e) {
    throw new Error("Could not connect. Make sure your Ledger is unlocked, then try again.");
  }
}

// Wait until device is ready (not locked) — subscribe and hold
function waitForReady(dmk: DeviceManagementKit, sessionId: string) {
  return dmk.getDeviceSessionState({ sessionId }).pipe(
    filter((state) => state.deviceStatus !== DeviceStatus.LOCKED),
    take(1),
  );
}
```

---

## Device Session State

```typescript
import { DeviceStatus, DeviceSessionStateType } from "@ledgerhq/device-management-kit";

const sub = dmk.getDeviceSessionState({ sessionId }).subscribe((state) => {
  // state.deviceStatus: CONNECTED | LOCKED | BUSY | NOT_CONNECTED
  if (state.deviceStatus === DeviceStatus.LOCKED) {
    showPrompt("Enter your PIN on your Ledger.");
    return;
  }

  // Additional fields only available in Ready states:
  if (state.sessionStateType !== DeviceSessionStateType.Connected) {
    console.log("App:", state.currentApp.name, state.currentApp.version);
    console.log("Battery:", state.batteryStatus?.level); // may be undefined over USB
  }
});

// Clean up:
sub.unsubscribe();
```

### Dashboard / home screen detection

When no app is open, `state.currentApp.name` is `"BOLOS"` or `"Dashboard"`. Check this when you need to detect the home screen explicitly — e.g. to show "please open the Ethereum app" before triggering a signer operation. Signer kits handle app-open automatically, so this check is optional but useful for pre-operation UX feedback.

```typescript
if (state.sessionStateType !== DeviceSessionStateType.Connected) {
  const appName = state.currentApp.name;
  if (appName === "BOLOS" || appName === "Dashboard") {
    showInfo("No app open. The correct app will open automatically when you proceed.");
  }
}
```

---

## Observable Subscription — Core Pattern

Every signer method returns `{ observable, cancel }`. The observable emits `DeviceActionState` objects.

```typescript
import { DeviceActionStatus, UserInteractionRequired } from "@ledgerhq/device-management-kit";

const { observable, cancel } = signer.someMethod(/* args */);

const sub = observable.subscribe({
  next: (state) => {
    switch (state.status) {
      case DeviceActionStatus.NotStarted:
        break;

      case DeviceActionStatus.Pending: {
        const interaction = state.intermediateValue.requiredUserInteraction;
        switch (interaction) {
          case UserInteractionRequired.UnlockDevice:
            showPrompt("Enter your PIN on your Ledger.");
            break;
          case UserInteractionRequired.ConfirmOpenApp:
            showPrompt("Confirm opening the app on your Ledger.");
            break;
          case UserInteractionRequired.VerifyAddress:
            showPrompt("Verify the address on your Ledger screen.");
            break;
          case UserInteractionRequired.SignTransaction:
            showPrompt("Review and approve the transaction on your Ledger.");
            break;
          case UserInteractionRequired.SignPersonalMessage:
            showPrompt("Review and sign the message on your Ledger.");
            break;
          case UserInteractionRequired.SignTypedData:
            showPrompt("Review and sign the typed data on your Ledger.");
            break;
          case UserInteractionRequired.AllowSecureConnection:
            showPrompt("Allow Ledger Manager on your device.");
            break;
          case UserInteractionRequired.None:
            showPrompt("Processing…");
            break;
        }
        break;
      }

      case DeviceActionStatus.Completed:
        // state.output contains the result — see dmk-sdk-reference.md for field names
        handleResult(state.output);
        sub.unsubscribe();
        break;

      case DeviceActionStatus.Error:
        handleError(state.error);
        sub.unsubscribe();
        break;


      case DeviceActionStatus.Stopped:
        // cancelled via cancel()
        sub.unsubscribe();
        break;
    }
  },
  error: (err) => {
    // Transport-level error (not a device error)
    handleTransportError(err);
  },
});

// To cancel:
cancel();
```

### Classifying errors by `_tag`

Errors from `DeviceActionStatus.Error` carry a `_tag` property for precise classification. Prefer `_tag` over message string matching — message text can change across versions, tag values are stable. `errorCode` carries the raw status word as a hex string.

**User rejection is not an error — treat it as a distinct outcome.** When the user presses the rejection button on the device, surface it as a "rejected" state in the UI (neutral/amber, not red), distinct from unexpected failures. This avoids alarming users who simply changed their mind.

```typescript
// Detect user rejection before general error classification.
// IMPORTANT: UnknownDeviceExchangeError (thrown when the error code is not in any map)
// buries errorCode inside originalError, not at the top level. Always check both.
// 6982 is the Solana-specific "Security status not satisfied / Canceled by user" code.
function isDeviceRejection(error: unknown): boolean {
  const tag = (error as any)?._tag ?? "";
  const code =
    (error as any)?.errorCode ??
    (error as any)?.originalError?.errorCode ??
    "";
  return (
    tag === "RefusedByUserDAError" ||
    code === "5501" ||  // global ActionRefusedError
    code === "6985" ||  // conditions of use not satisfied (generic Ledger rejection)
    code === "6982"     // Solana: "Security status not satisfied (Canceled by user)"
  );
}

function classifyDeviceError(error: unknown): string {
  const tag = (error as any)?._tag ?? "";
  const errorCode = (error as any)?.errorCode ?? "";

  // Do not call this for rejections — check isDeviceRejection() first and handle separately
  if (tag === "DeviceLockedError" || errorCode === "5515")
    return "Device locked. Enter your PIN.";
  if (errorCode === "6807")
    return "App not installed. Install it via Ledger Live.";
  if (errorCode === "6a80")
    return "Blind signing not enabled. Enable it in the app settings on device.";
  if (errorCode === "6e00")
    return "Wrong app open. The correct app will open automatically.";
  if (tag === "DeviceDisconnectedWhileSendingError")
    return "Device disconnected. Reconnect and retry.";
  if (tag === "SendApduTimeoutError")
    return "Communication timed out. Check your connection.";
  if (tag === "NoAccessibleDeviceError")
    return "No device found or access denied.";
  return (error as Error)?.message ?? "Unexpected error.";
}
```

Usage pattern in a catch block:
```typescript
} catch (err) {
  if (isDeviceRejection(err)) {
    showRejected("Action cancelled on device."); // neutral/amber UI state
  } else {
    showError(classifyDeviceError(err)); // red error state
  }
}
```

### Converting observable to promise (simpler flows)
```typescript
import { firstValueFrom, filter, map } from "rxjs";

const output = await firstValueFrom(
  observable.pipe(
    filter((s) =>
      s.status === DeviceActionStatus.Completed ||
      s.status === DeviceActionStatus.Error
    ),
    map((s) => {
      if (s.status === DeviceActionStatus.Error) throw s.error;
      return s.output;
    }),
  ),
);
```

---

## Ethereum Signer

```typescript
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";

const signerEth = new SignerEthBuilder({
  dmk,
  sessionId,
  originToken: "your-token", // enables Clear Signing — omit and users see raw hex
}).build();

// Get address
const { observable } = signerEth.getAddress("44'/60'/0'/0/0", {
  checkOnDevice: true,
});
// Completed → state.output.address (0x…), state.output.publicKey

// Sign transaction (transaction must be RLP-encoded Uint8Array)
const { observable } = signerEth.signTransaction("44'/60'/0'/0/0", txBytes);
// Completed → state.output.r, state.output.s, state.output.v

// Sign personal message
const { observable } = signerEth.signMessage("44'/60'/0'/0/0", "Hello");
// Completed → state.output.r, state.output.s, state.output.v

// Sign EIP-712 typed data
const { observable } = signerEth.signTypedData("44'/60'/0'/0/0", {
  domain: { name: "MyApp", version: "1", chainId: 1 },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
    ],
    Message: [{ name: "content", type: "string" }],
  },
  primaryType: "Message",
  message: { content: "Hello" },
});
// Completed → state.output.r, state.output.s, state.output.v

// Sign EIP-7702 delegation authorization
const { observable } = signerEth.signDelegationAuthorization(
  "44'/60'/0'/0/0",
  1,        // chainId
  "0x…",   // contract address
  0,        // nonce
);
```

---

## Bitcoin Signer

**`DefaultDescriptorTemplate` uses SCREAMING_CASE: `NATIVE_SEGWIT`, `NESTED_SEGWIT`, `LEGACY`, `TAPROOT`.**

```typescript
import {
  SignerBtcBuilder,
  DefaultWallet,
  DefaultDescriptorTemplate,
  WalletPolicy,
} from "@ledgerhq/device-signer-kit-bitcoin";

const signerBtc = new SignerBtcBuilder({ dmk, sessionId }).build();

// Get wallet address — use this to show a receive address to the user
// checkOnDevice: true is required for any flow where the user is given an address to receive funds —
// the device screen is the only trusted display. getWalletAddress returns a native SegWit address (bc1q…).
const { observable } = signerBtc.getWalletAddress(
  new DefaultWallet("84'/0'/0'", DefaultDescriptorTemplate.NATIVE_SEGWIT),
  0, // address index
  { checkOnDevice: true },
);
// Completed → state.output.address (string)

// Get extended public key — use this for xpub export, wallet derivation, or PSBT construction.
// Not for displaying a receive address to the user.
const { observable } = signerBtc.getExtendedPublicKey("84'/0'/0'", {
  checkOnDevice: false,
});
// Completed → state.output.extendedPublicKey (string)

// Sign PSBT
const { observable } = signerBtc.signPsbt(
  new DefaultWallet("84'/0'/0'", DefaultDescriptorTemplate.NATIVE_SEGWIT),
  psbtBytes, // Uint8Array
);

// Register multisig wallet policy (required before signing with custom policy)
const { observable } = signerBtc.registerWallet(
  new WalletPolicy("My Multisig", "wsh(multi(2,@0/**,@1/**))", [key1, key2]),
);

// Sign transaction (PSBT sign + finalize and extract — use signPsbt if you need raw PSBT output)
const { observable } = signerBtc.signTransaction(
  new DefaultWallet("84'/0'/0'", DefaultDescriptorTemplate.NATIVE_SEGWIT),
  psbtBytes, // Uint8Array
);

// Sign message
const { observable } = signerBtc.signMessage("84'/0'/0'/0/0", "message");
// Completed → state.output.r, state.output.s, state.output.v

// Get master fingerprint
const { observable } = signerBtc.getMasterFingerprint();
// Completed → state.output.masterFingerprint (Uint8Array)
```

---

## Solana Signer

```typescript
import { SignerSolanaBuilder, SignMessageVersion } from "@ledgerhq/device-signer-kit-solana";

const signerSol = new SignerSolanaBuilder({ dmk, sessionId }).build();

// Get address
const { observable } = signerSol.getAddress("44'/501'/0'/0'", {
  checkOnDevice: true,
});
// Completed → state.output.publicKey (base58 string)

// Sign transaction (pass serialized message bytes)
const { observable } = signerSol.signTransaction(
  "44'/501'/0'/0'",
  messageBytes, // Uint8Array — serialized transaction message
  {
    solanaRPCURL: "https://api.mainnet-beta.solana.com/", // default; used for context resolution
    transactionResolutionContext: { /* optional — token context for clear signing */ },
  },
);
// Completed → state.output.signature (Uint8Array)

// Sign message
const { observable } = signerSol.signMessage(
  "44'/501'/0'/0'",
  "Hello",
  { version: SignMessageVersion.V0 },
);
// Completed → state.output.signature (base58 string)

// Get app configuration
const { observable } = signerSol.getAppConfiguration();
// Completed → state.output: { blindSigningEnabled, pubKeyDisplayMode, version }
```

---

## Cosmos Signer

```typescript
import { SignerCosmosBuilder } from "@ledgerhq/device-signer-kit-cosmos";

const signerCosmos = new SignerCosmosBuilder({ dmk, sessionId }).build();

// Get address (requires HRP — human-readable part of the bech32 address)
const { observable } = signerCosmos.getAddress("44'/118'/0'/0/0", "cosmos", {
  checkOnDevice: true,
});
// Completed → state.output.publicKey (Uint8Array), state.output.address ("cosmos1…")

// Sign transaction
const { observable } = signerCosmos.signTransaction(
  "44'/118'/0'/0/0",
  "cosmos",
  txBytes, // Uint8Array
);
```

---

## Pre-Built Commands

`dmk.sendCommand()` returns a `CommandResult` — always check with `isSuccessCommandResult()` before accessing `result.data`. Unlike signer operations, commands are synchronous promise-based calls with no observable.

```typescript
import {
  OpenAppCommand,
  CloseAppCommand,
  GetOsVersionCommand,
  GetAppAndVersionCommand,
  isSuccessCommandResult,
} from "@ledgerhq/device-management-kit";

// Open an app (no user confirmation observable — use OpenAppDeviceAction if you need that)
await dmk.sendCommand({ sessionId, command: new OpenAppCommand("Ethereum") });

// Close the current app
await dmk.sendCommand({ sessionId, command: new CloseAppCommand() });

// Get firmware version
const osResult = await dmk.sendCommand({ sessionId, command: new GetOsVersionCommand() });
if (isSuccessCommandResult(osResult)) {
  console.log("Firmware:", osResult.data.seVersion);
  console.log("MCU:", osResult.data.mcuSephVersion);
}

// Get current app name and version
const appResult = await dmk.sendCommand({ sessionId, command: new GetAppAndVersionCommand() });
if (isSuccessCommandResult(appResult)) {
  console.log("App:", appResult.data.name, appResult.data.version);
}
```

Use `OpenAppDeviceAction` via `dmk.executeDeviceAction()` when you need the full observable state machine with user confirmation prompts. Use `OpenAppCommand` only as a lower-level primitive when you control the flow yourself.

---

## Secure Channel Operations

Requires `@ledgerhq/device-management-kit`. No signer builder — call `dmk.executeDeviceAction()` directly. All operations prompt `AllowSecureConnection` on first use per device reboot.

```typescript
import {
  GenuineCheckDeviceAction,
  ListInstalledAppsDeviceAction,
  InstallAppDeviceAction,
  UninstallAppDeviceAction,
  DeviceActionStatus,
} from "@ledgerhq/device-management-kit";

// Genuine check — verify device authenticity against Ledger HSM
const { observable, cancel } = dmk.executeDeviceAction({
  sessionId,
  deviceAction: new GenuineCheckDeviceAction({ input: { unlockTimeout: 60000 } }),
});
// Completed → state.output.isGenuine (boolean)

// List installed apps
const { observable, cancel } = dmk.executeDeviceAction({
  sessionId,
  deviceAction: new ListInstalledAppsDeviceAction({ input: { unlockTimeout: 60000 } }),
});
// Completed → state.output.installedApps (InstalledApp[])

// Install app — emits progress in intermediateValue.progress (0–100)
const { observable, cancel } = dmk.executeDeviceAction({
  sessionId,
  deviceAction: new InstallAppDeviceAction({ input: { appName: "Ethereum", unlockTimeout: 60000 } }),
});

// Uninstall app
const { observable, cancel } = dmk.executeDeviceAction({
  sessionId,
  deviceAction: new UninstallAppDeviceAction({ input: { appName: "Ethereum", unlockTimeout: 60000 } }),
});
```

Subscribe to all of the above using the standard observable pattern. Handle `AllowSecureConnection` in the `Pending` branch — see Observable Subscription section above.

---

## Custom APDU Commands

**Use only when no signer kit and no device action covers the operation.** If a signer kit exists for the chain, use it — raw APDU bypasses pre-flight checks, observable confirmation states, and error classification.

```typescript
import {
  type Command,
  type CommandResult,
  CommandResultFactory,
  CommandUtils,
  GlobalCommandErrorHandler,
  ApduBuilder,
  ApduParser,
  type ApduResponse,
  InvalidStatusWordError,
} from "@ledgerhq/device-management-kit";

interface MyResponse {
  data: string;
}

class MyCommand implements Command<MyResponse> {
  args = undefined;

  getApdu() {
    return new ApduBuilder({ cla: 0xe0, ins: 0x02, p1: 0x00, p2: 0x00 })
      .addAsciiStringToData("payload")
      .build();
  }

  parseResponse(response: ApduResponse): CommandResult<MyResponse> {
    if (!CommandUtils.isSuccessResponse(response)) {
      return CommandResultFactory({ error: GlobalCommandErrorHandler.handle(response) });
    }
    const parser = new ApduParser(response);
    const rawData = parser.extractFieldByLength(32);
    if (!rawData) {
      return CommandResultFactory({ error: new InvalidStatusWordError("Missing data") });
    }
    return CommandResultFactory({ data: { data: parser.encodeToHexaString(rawData) } });
  }
}

const result = await dmk.sendCommand({ sessionId, command: new MyCommand() });
```
