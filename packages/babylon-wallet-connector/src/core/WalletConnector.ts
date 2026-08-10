import { createNanoEvents } from "nanoevents";

import { Wallet } from "@/core/Wallet";
import type { IConnector, IProvider } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

type DisconnectableProvider = IProvider & { disconnect?: () => Promise<void> };

export interface ConnectorEvents<P extends IProvider> {
  connecting: (message?: string, description?: string) => void;
  connect: (wallet: Wallet<P>) => void;
  disconnect: (wallet: Wallet<P>) => void;
  error: (error: Error) => void;
}

export class WalletConnector<N extends string, P extends IProvider, C> implements IConnector<N, P, C> {
  private _connectedWallet: Wallet<P> | null = null;
  private _ee = createNanoEvents<ConnectorEvents<P>>();

  constructor(
    public readonly id: N,
    public readonly name: string,
    public readonly icon: string,
    public readonly wallets: Wallet<P>[],
    public readonly config: C,
  ) {}

  get connectedWallet() {
    return this._connectedWallet;
  }

  async connect(wallet: string | Wallet<P>) {
    try {
      const selectedWallet = typeof wallet === "string" ? this.wallets.find((w) => w.id === wallet) : wallet;

      if (!selectedWallet) {
        throw new WalletError({
          code: ERROR_CODES.EXTENSION_NOT_FOUND,
          message: "Wallet not found",
        });
      }
      this._ee.emit("connecting", `Connecting ${selectedWallet.name}`);

      const reportProgress = (message?: string, description?: string) =>
        this._ee.emit("connecting", message, description);
      await selectedWallet.connect(reportProgress);
      this._connectedWallet = selectedWallet;
      this._ee.emit("connect", this._connectedWallet);

      return this.connectedWallet;
    } catch (e: any) {
      this._ee.emit("error", e);
      return null;
    }
  }

  async disconnect() {
    const connectedWallet = this._connectedWallet;
    if (!connectedWallet) return;

    // Clear first. Provider teardown can synchronously emit its own disconnect
    // event, which may route back here through a React provider. Clearing the
    // pointer before awaiting it makes that re-entrant call a no-op and ensures
    // connector state never remains stale after a raw provider disconnect.
    this._connectedWallet = null;
    // Publish the state transition before awaiting a wallet SDK. A locked or
    // sleeping provider may never settle, but widget/storage consumers must be
    // able to clear this chain immediately.
    this._ee.emit("disconnect", connectedWallet);
    const provider = connectedWallet.provider as DisconnectableProvider | null;
    if (provider?.disconnect && typeof provider.disconnect === "function") {
      try {
        await provider.disconnect();
      } catch {
        // ignore provider disconnect errors
      }
    }
  }

  clone() {
    return new WalletConnector(this.id, this.name, this.icon, this.wallets, this.config);
  }

  on<K extends keyof ConnectorEvents<P>>(name: K, handler: ConnectorEvents<P>[K]) {
    return this._ee.on(name, handler);
  }
}
