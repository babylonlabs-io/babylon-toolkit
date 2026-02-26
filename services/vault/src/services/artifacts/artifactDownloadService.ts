import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import type { RequestDepositorClaimerArtifactsResponse } from "@/clients/vault-provider-rpc/types";
import { stripHexPrefix } from "@/utils/btc";

const RPC_TIMEOUT_MS = 120 * 1000;

export async function fetchDepositorArtifacts(
  providerUrl: string,
  peginTxid: string,
  depositorPk: string,
): Promise<RequestDepositorClaimerArtifactsResponse> {
  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);
  return rpcClient.requestDepositorClaimerArtifacts({
    pegin_txid: stripHexPrefix(peginTxid),
    depositor_pk: depositorPk,
  });
}

export function triggerArtifactDownload(
  artifacts: RequestDepositorClaimerArtifactsResponse,
  peginTxid: string,
): void {
  const blob = new Blob([JSON.stringify(artifacts)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `babylon-vault-artifacts-${peginTxid.slice(0, 8)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
