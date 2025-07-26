interface ErrorParams {
  code: string;
  message: string;
  wallet?: string;
  version?: string;
  chainId?: string;
}

export class WalletError extends Error {
  readonly code: string;
  readonly wallet?: string;
  readonly version?: string;
  readonly chainId?: string;

  constructor({ code, message, wallet, version, chainId }: ErrorParams, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.wallet = wallet;
    this.version = version;
    this.chainId = chainId;
  }
}

export * from "./codes";
