/**
 * A wallet client for one send, which lets the wallet take at most one
 * transaction submission.
 *
 * viem's `sendTransaction` (and `writeContract`, which calls it) can submit
 * twice inside one call. When the wallet answers `eth_sendTransaction` with
 * -32000 or -32602, viem sends the same request again as
 * `wallet_sendTransaction`; once a wallet has served that method, viem starts
 * every send with it and repeats it after such an error (viem 2.38.2,
 * actions/wallet/sendTransaction.ts). A node's "nonce too low" arrives as
 * -32000, and it can come back for a transaction the wallet did broadcast, so
 * the repeat can execute the call twice before `sendWithStaleNonceRetry` sees
 * the error at all.
 *
 * So once the wallet has taken a submission, answering it with a hash or with
 * any error other than "method not supported", a further one is refused with
 * -32601 (method not found). viem then stops and rejects with the wallet's
 * first error. A wallet that does not serve `eth_sendTransaction` still gets
 * `wallet_sendTransaction`: "method not supported" means nothing was submitted.
 */

import {
  createWalletClient,
  custom,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  UnsupportedProviderMethodError,
  type WalletClient,
} from "viem";

const SUBMISSION_METHODS: ReadonlySet<string> = new Set([
  "eth_sendTransaction",
  "wallet_sendTransaction",
]);

/** Answers for a method the wallet does not serve, so it submitted nothing. */
const METHOD_UNSUPPORTED_CODES: ReadonlySet<number> = new Set([
  MethodNotFoundRpcError.code,
  MethodNotSupportedRpcError.code,
  UnsupportedProviderMethodError.code,
]);

function isMethodUnsupported(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const { code } = error as { code?: unknown };
  return typeof code === "number" && METHOD_UNSUPPORTED_CODES.has(code);
}

/**
 * A client over `walletClient`'s own provider for a single send: every request
 * passes through, except a second transaction submission once the wallet has
 * taken one. Create one per send, since a retried send is a new submission.
 */
export function singleSubmissionWalletClient(
  walletClient: WalletClient,
): WalletClient {
  let submitted = false;
  return createWalletClient({
    account: walletClient.account,
    chain: walletClient.chain,
    transport: custom(
      {
        async request(
          args: Parameters<WalletClient["transport"]["request"]>[0],
        ) {
          // The provider's own request function, not `walletClient.request`:
          // this transport maps its errors, so they are not wrapped twice.
          const forward = walletClient.transport.request;
          if (!SUBMISSION_METHODS.has(args.method)) return forward(args);
          if (submitted) {
            throw Object.assign(
              new Error(
                "Refused a second transaction submission in one send: the wallet already took one, and its outcome is unknown.",
              ),
              { code: MethodNotFoundRpcError.code },
            );
          }
          submitted = true;
          try {
            return await forward(args);
          } catch (error) {
            if (isMethodUnsupported(error)) submitted = false;
            throw error;
          }
        },
      },
      { retryCount: 0 },
    ),
  });
}
