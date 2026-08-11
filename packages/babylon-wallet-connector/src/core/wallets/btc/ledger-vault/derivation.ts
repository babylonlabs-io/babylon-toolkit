/**
 * Read-only key derivation for the Ledger vault provider.
 *
 * The vault app inherits the Bitcoin base app's derivation instructions
 * (`app-babylon-vault` builds on `LedgerHQ/app-bitcoin-new`), so the published
 * `@ledgerhq/device-signer-kit-bitcoin` drives them. `DefaultWallet` with the
 * taproot template is documented as usable WITHOUT device registration, which
 * is what makes a plain BIP-86 path safe to read here.
 *
 * Both reads pass `skipOpenApp: true`. The kit otherwise force-opens an app it
 * calls "Bitcoin", but the device app is "Babylon Vault" — so DMK would quit the
 * vault app (or fail outright on a device that has only the vault app), and any
 * later custom APDU would hit the wrong app.
 *
 * Signing is deliberately NOT routed through this package — the vault flows need
 * a no-policy SIGN_PSBT, which this package cannot express (#2109).
 *
 * @module wallets/btc/ledger-vault/derivation
 */

import type { Observable } from "rxjs";

import type { DmkSessionHandle } from "./dmkSession";

/** `m/86'/<coin>'/<account>'` — the account-level prefix for the wallet policy. */
function accountPath(coinType: number, account = 0): string {
  return `m/86'/${coinType}'/${account}'`;
}

/** The full 5-level leaf the intent pins (`change`/`index` are non-hardened). */
function leafPath(coinType: number, account = 0, change = 0, index = 0): string {
  return `${accountPath(coinType, account)}/${change}/${index}`;
}

/** Terminal states of a DMK device action. */
type DeviceActionState<T> = {
  status: string;
  output?: T;
  error?: unknown;
};

/**
 * Bridge a DMK device action to a Promise.
 *
 * Device actions emit progress values and settle on a terminal state; we want
 * only the terminal one, so this resolves on `completed` and rejects on
 * anything else terminal (error, stopped).
 */
async function firstTerminal<T>(action: { observable: Observable<DeviceActionState<T>> }): Promise<T> {
  const { firstValueFrom, filter, map } = await import("rxjs");

  return firstValueFrom(
    action.observable.pipe(
      filter((state) => state.status !== "pending"),
      map((state) => {
        if (state.status === "completed" && state.output !== undefined) {
          return state.output;
        }
        const detail = (state.error as Error | undefined)?.message ?? String(state.error ?? "no detail");
        throw new Error(`Ledger device action ${state.status}: ${detail}`);
      }),
    ),
  );
}

async function signerFor(handle: DmkSessionHandle) {
  const { SignerBtcBuilder } = await import("@ledgerhq/device-signer-kit-bitcoin");
  return new SignerBtcBuilder({ dmk: handle.dmk, sessionId: handle.sessionId }).build();
}

/**
 * Read the x-only public key at the intent's 5-level leaf path.
 *
 * The device returns an extended key at that path; `@scure/bip32` decodes it so
 * we can take the 33-byte compressed key and drop the parity prefix. x-only is
 * what the intent and every taproot script expect.
 */
export async function getXOnlyPublicKeyHex(
  handle: DmkSessionHandle,
  coinType: number,
  bip32Versions: { private: number; public: number },
): Promise<string> {
  const signer = await signerFor(handle);
  const { HDKey } = await import("@scure/bip32");

  const result = await firstTerminal<{ extendedPublicKey: string }>(
    signer.getExtendedPublicKey(leafPath(coinType), { skipOpenApp: true }) as unknown as {
      observable: Observable<DeviceActionState<{ extendedPublicKey: string }>>;
    },
  );

  // The signet/testnet build returns a tpub; @scure/bip32 defaults to mainnet
  // version bytes and throws "Version mismatch" without these.
  const node = HDKey.fromExtendedKey(result.extendedPublicKey, bip32Versions);
  if (!node.publicKey || node.publicKey.length !== 33) {
    throw new Error("Ledger returned an extended key without a 33-byte public key");
  }
  return Buffer.from(node.publicKey.subarray(1)).toString("hex");
}

/**
 * Read the BIP-86 taproot address at the intent's leaf.
 *
 * `DefaultWallet` needs no prior `registerWallet` — a standard taproot policy
 * is built into the app.
 */
export async function getTaprootAddress(handle: DmkSessionHandle, coinType: number): Promise<string> {
  const signer = await signerFor(handle);
  const { DefaultWallet, DefaultDescriptorTemplate } = await import("@ledgerhq/device-signer-kit-bitcoin");

  const wallet = new DefaultWallet(accountPath(coinType), DefaultDescriptorTemplate.TAPROOT);
  const result = await firstTerminal<{ address: string }>(
    signer.getWalletAddress(wallet, 0, { skipOpenApp: true }) as unknown as {
      observable: Observable<DeviceActionState<{ address: string }>>;
    },
  );
  return result.address;
}
