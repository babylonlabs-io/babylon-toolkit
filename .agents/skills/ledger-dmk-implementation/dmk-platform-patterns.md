# DMK Platform Patterns

Environment-specific integration patterns. Load this file when the target platform is known.

---

## React

### DMK Context Provider

Do NOT use a module-level singleton in React — use this provider exclusively. Creating both causes two DMK instances.

```typescript
import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  type PropsWithChildren,
} from "react";
import {
  DeviceManagementKit,
  DeviceManagementKitBuilder,
} from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";

const DmkContext = createContext<DeviceManagementKit | null>(null);

export function DmkProvider({ children }: PropsWithChildren) {
  const dmk = useMemo(
    () =>
      new DeviceManagementKitBuilder()
        .addTransport(webHidTransportFactory)
        .build(),
    [],
  );

  useEffect(() => () => dmk.close(), [dmk]);

  return <DmkContext.Provider value={dmk}>{children}</DmkContext.Provider>;
}

export function useDmk(): DeviceManagementKit {
  const dmk = useContext(DmkContext);
  if (!dmk) throw new Error("useDmk must be used within DmkProvider");
  return dmk;
}
```

### useConnectDevice hook

```typescript
import { useState, useCallback } from "react";
import { firstValueFrom } from "rxjs";

export function useConnectDevice(dmk: DeviceManagementKit) {
  const [sessionId, setSessionId] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(
    async (transport = "WEB-HID") => {
      setIsConnecting(true);
      setError(undefined);
      try {
        const device = await firstValueFrom(
          dmk.startDiscovering({ transport }),
        );
        const id = await dmk.connect({ device });
        setSessionId(id);
        return id;
      } catch (e) {
        setError(e);
      } finally {
        setIsConnecting(false);
      }
    },
    [dmk],
  );

  const disconnect = useCallback(async () => {
    if (sessionId) {
      await dmk.disconnect({ sessionId });
      setSessionId(undefined);
    }
  }, [dmk, sessionId]);

  return { sessionId, error, isConnecting, connect, disconnect };
}
```

### useDeviceSessionState hook

```typescript
import { useState, useEffect } from "react";
import { type DeviceSessionState } from "@ledgerhq/device-management-kit";

export function useDeviceSessionState(
  dmk: DeviceManagementKit,
  sessionId: string | undefined,
) {
  const [state, setState] = useState<DeviceSessionState>();

  useEffect(() => {
    if (!sessionId) {
      setState(undefined);
      return;
    }
    const sub = dmk.getDeviceSessionState({ sessionId }).subscribe(setState);
    return () => sub.unsubscribe();
  }, [dmk, sessionId]);

  return state;
}
```

### Signer provider (Ethereum example — replicate per chain)

```typescript
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type PropsWithChildren,
} from "react";
import {
  SignerEthBuilder,
  type SignerEth,
} from "@ledgerhq/device-signer-kit-ethereum";

const SignerEthContext = createContext<SignerEth | null>(null);

export function SignerEthProvider({
  sessionId,
  children,
}: PropsWithChildren<{ sessionId: string | undefined }>) {
  const dmk = useDmk();
  const [signer, setSigner] = useState<SignerEth | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSigner(null);
      return;
    }
    setSigner(new SignerEthBuilder({ dmk, sessionId }).build());
  }, [dmk, sessionId]);

  return (
    <SignerEthContext.Provider value={signer}>
      {children}
    </SignerEthContext.Provider>
  );
}

export const useSignerEth = () => useContext(SignerEthContext);
```

### DevicePrompt component

```tsx
import { DeviceActionStatus, UserInteractionRequired } from "@ledgerhq/device-management-kit";

const PROMPTS: Record<string, string> = {
  [UserInteractionRequired.UnlockDevice]: "Unlock your Ledger and enter your PIN",
  [UserInteractionRequired.ConfirmOpenApp]: "Confirm opening the app on your Ledger",
  [UserInteractionRequired.VerifyAddress]: "Verify the address on your Ledger screen",
  [UserInteractionRequired.SignTransaction]: "Review and approve the transaction on your Ledger",
  [UserInteractionRequired.SignPersonalMessage]: "Review and sign the message on your Ledger",
  [UserInteractionRequired.SignTypedData]: "Review and sign the typed data on your Ledger",
  [UserInteractionRequired.None]: "Processing…",
};

export function DevicePrompt({ state }: { state: DeviceActionState<any, any, any> }) {
  if (state.status !== DeviceActionStatus.Pending) return null;
  const interaction = state.intermediateValue.requiredUserInteraction;
  return (
    <div className="device-prompt">
      {PROMPTS[interaction] ?? "Check your Ledger…"}
    </div>
  );
}
```

### Full page example

```tsx
function WalletPage() {
  const dmk = useDmk();
  const { sessionId, connect, disconnect, isConnecting } = useConnectDevice(dmk);
  const deviceState = useDeviceSessionState(dmk, sessionId);
  const signerEth = useSignerEth();
  const [address, setAddress] = useState<string>();
  const [actionState, setActionState] = useState<any>();

  const handleGetAddress = () => {
    if (!signerEth) return;
    const { observable } = signerEth.getAddress("44'/60'/0'/0/0", {
      checkOnDevice: true,
    });
    observable.subscribe((state) => {
      setActionState(state);
      if (state.status === DeviceActionStatus.Completed) {
        setAddress(state.output.address);
      }
    });
  };

  return (
    <div>
      {!sessionId ? (
        <button onClick={() => connect()} disabled={isConnecting}>
          {isConnecting ? "Connecting…" : "Connect Ledger"}
        </button>
      ) : (
        <>
          <p>Status: {deviceState?.deviceStatus}</p>
          <DevicePrompt state={actionState} />
          <button onClick={handleGetAddress}>Get ETH Address</button>
          {address && <p>{address}</p>}
          <button onClick={disconnect}>Disconnect</button>
        </>
      )}
    </div>
  );
}
```

---

## Vite Configuration

Required for Bitcoin and Solana signers (need Node.js polyfills for `buffer`, `process`, `crypto`):

```bash
npm install vite-plugin-node-polyfills
```

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  optimizeDeps: {
    include: ["crypto-js"], // Bitcoin signer dependency
  },
});
```

---

## Node.js CLI

### DMK singleton (one per process)

```typescript
// dmk.ts
import { DeviceManagementKitBuilder } from "@ledgerhq/device-management-kit";
import { nodeHidTransportFactory } from "@ledgerhq/device-transport-kit-node-hid";

export const dmk = new DeviceManagementKitBuilder()
  .addTransport(nodeHidTransportFactory)
  .build();
```

### Complete flow: connect → unlock → sign → disconnect

```typescript
import {
  DeviceManagementKit,
  DeviceStatus,
  DeviceActionStatus,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import { firstValueFrom, filter, take, timeout } from "rxjs";
import { dmk } from "./dmk";

const TIMEOUT_MS = 60_000;

// Print device interaction prompts to stderr (keeps stdout clean for data output)
function printInteraction(interaction: string): void {
  const prompts: Record<string, string> = {
    [UserInteractionRequired.UnlockDevice]: "Enter your PIN on the Ledger…",
    [UserInteractionRequired.ConfirmOpenApp]: "Confirm opening the app on your Ledger…",
    [UserInteractionRequired.VerifyAddress]: "Verify the address on your Ledger screen…",
    [UserInteractionRequired.SignTransaction]: "Approve the transaction on your Ledger…",
    [UserInteractionRequired.SignPersonalMessage]: "Sign the message on your Ledger…",
    [UserInteractionRequired.SignTypedData]: "Sign the typed data on your Ledger…",
  };
  const msg = prompts[interaction];
  if (msg) process.stderr.write(`⏳ ${msg}\n`);
}

// Generic helper: run any signer action and return its output as a promise
function runAction<T>(action: { observable: any; cancel: () => void }): Promise<T> {
  return new Promise((resolve, reject) => {
    action.observable.subscribe({
      next: (state: any) => {
        switch (state.status) {
          case DeviceActionStatus.Pending:
            printInteraction(state.intermediateValue.requiredUserInteraction);
            break;
          case DeviceActionStatus.Completed:
            resolve(state.output as T);
            break;
          case DeviceActionStatus.Error:
            reject(state.error);
            break;
          case DeviceActionStatus.Stopped:
            reject(new Error("Action cancelled"));
            break;
        }
      },
      error: (err: unknown) => reject(err),
    });
  });
}

let activeSessionId: string | undefined;

async function cleanup() {
  if (activeSessionId) {
    await dmk.disconnect({ sessionId: activeSessionId });
  }
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

async function main() {
  // 1. Wait for a device to be available
  process.stderr.write("⏳ Waiting for Ledger device…\n");
  const devices = await firstValueFrom(
    dmk.listenToAvailableDevices({}).pipe(
      filter((list) => list.length > 0),
      timeout(TIMEOUT_MS),
    ),
  );
  const sessionId = await dmk.connect({ device: devices[0]! });
  activeSessionId = sessionId;
  process.stderr.write("✅ Connected.\n");

  // 2. Wait for unlock if needed
  const currentState = await firstValueFrom(
    dmk.getDeviceSessionState({ sessionId }).pipe(take(1)),
  );
  if (currentState.deviceStatus === DeviceStatus.LOCKED) {
    process.stderr.write("🔓 Device locked — enter your PIN…\n");
    await firstValueFrom(
      dmk.getDeviceSessionState({ sessionId }).pipe(
        filter((s) => s.deviceStatus !== DeviceStatus.LOCKED),
        take(1),
        timeout(TIMEOUT_MS),
      ),
    );
    process.stderr.write("✅ Unlocked.\n");
  }

  // 3. Create signer and run operations
  const signerEth = new SignerEthBuilder({ dmk, sessionId }).build();

  const { address } = await runAction<{ address: string }>(
    signerEth.getAddress("44'/60'/0'/0/0", { checkOnDevice: false }),
  );
  console.log("Address:", address);

  // 4. Disconnect and clean up
  await dmk.disconnect({ sessionId });
  activeSessionId = undefined;
  process.stderr.write("✅ Disconnected.\n");
}

main().catch((err) => {
  process.stderr.write(`❌ ${(err as Error).message ?? err}\n`);
  process.exit(1);
});
```

### Runtime notes
- **Node.js 18+** required
- Use `tsx` to run TypeScript directly: `npx tsx src/main.ts`
- DMK packages are ESM-only — use `"type": "module"` in `package.json`

### Alternative: custom WebUSB transport (when node-hid fails)

If `@ledgerhq/device-transport-kit-node-hid` fails due to native addon build issues, use the `usb` npm package which provides a Node.js WebUSB API:

```bash
npm install usb
```

Create a custom `Transport` implementation using `WebUSBDevice` from the `usb` package. Same WebUSB bulk endpoint protocol (64-byte frames) as browsers, over native USB.

```typescript
const LEDGER_VENDOR_ID = 0x2c97;
const FRAME_SIZE = 64;
const LEDGER_WEBUSB_ENDPOINT_NUMBER = 3;
const LEDGER_WEBUSB_CONFIGURATION_VALUE = 1;
```

---

## EIP-1193 Provider (for ethers.js / viem / wagmi)

Wraps the Ethereum signer as a standard EIP-1193 provider so it can plug into any web3 library.

```typescript
import { DeviceActionStatus } from "@ledgerhq/device-management-kit";
import { type SignerEth } from "@ledgerhq/device-signer-kit-ethereum";
import { firstValueFrom, filter, map } from "rxjs";

class LedgerEIP1193Provider {
  constructor(
    private signerEth: SignerEth,
    private derivationPath: string,
  ) {}

  async request({ method, params }: { method: string; params?: any[] }) {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts": {
        const output = await this.resolve(
          this.signerEth.getAddress(this.derivationPath),
        );
        return [output.address];
      }
      case "personal_sign": {
        const output = await this.resolve(
          this.signerEth.signMessage(this.derivationPath, params![0]),
        );
        return this.toHexSig(output);
      }
      case "eth_signTypedData_v4": {
        const output = await this.resolve(
          this.signerEth.signTypedData(
            this.derivationPath,
            JSON.parse(params![1]),
          ),
        );
        return this.toHexSig(output);
      }
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  private resolve<T>({ observable }: { observable: any }): Promise<T> {
    return firstValueFrom(
      observable.pipe(
        filter(
          (s: any) =>
            s.status === DeviceActionStatus.Completed ||
            s.status === DeviceActionStatus.Error,
        ),
        map((s: any) => {
          if (s.status === DeviceActionStatus.Error) throw s.error;
          return s.output;
        }),
      ),
    );
  }

  private toHexSig(output: { r: string; s: string; v: number }): string {
    return `0x${output.r.slice(2)}${output.s.slice(2)}${output.v.toString(16).padStart(2, "0")}`;
  }
}

---

## WebAuthn / Security Key

The Ledger Security Key app enables FIDO2/WebAuthn. **The DMK's role is limited to installing or uninstalling the app** via `InstallAppDeviceAction` / `UninstallAppDeviceAction`. The credential operations use the browser's native WebAuthn API — not the DMK.

The Ledger acts as a cross-platform roaming authenticator. Open the Security Key app before calling `navigator.credentials`:

```typescript
await dmk.sendCommand({ sessionId, command: new OpenAppCommand("Security Key") });
```

### Register a passkey

```typescript
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "My App", id: window.location.hostname },
    user: {
      id: new TextEncoder().encode("user-id"),
      name: "user@example.com",
      displayName: "User",
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },   // ES256
      { alg: -257, type: "public-key" }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: "cross-platform", // Ledger is a roaming authenticator
      userVerification: "preferred",
    },
    timeout: 60000,
  },
});
```

### Authenticate with a passkey

```typescript
const assertion = await navigator.credentials.get({
  publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rpId: window.location.hostname,
    userVerification: "preferred",
    timeout: 60000,
  },
});
```

Both calls require a user gesture. The Ledger device will prompt for confirmation on screen during registration and authentication.
