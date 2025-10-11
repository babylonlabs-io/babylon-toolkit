import { Text, Copy, CopyIcon } from "@babylonlabs-io/core-ui";

import { BABYLON_EXPLORER } from "@/ui/common/constants";
import { trim } from "@/ui/common/utils/trim";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";

import type { ClaimResult } from "./ClaimStatusModal";

function CopyButton({ value }: { value: string }) {
  return (
    <Copy
      value={value}
      className="text-accent-secondary hover:opacity-80"
      copiedText="✓"
    >
      <CopyIcon className="text-accent-secondary" size={14} />
    </Copy>
  );
}

function Row({
  title,
  result,
}: {
  title: string;
  result: ClaimResult | undefined;
}) {
  const success = Boolean(result?.success && result.txHash);
  const tx = result?.txHash ?? "";

  return (
    <div className="flex items-center justify-between">
      <Text variant="body1" className="text-accent-primary">
        {title}
      </Text>
      <div className="flex items-center gap-2">
        {success ? (
          <>
            {BABYLON_EXPLORER ? (
              <a
                href={`${BABYLON_EXPLORER}/transaction/${tx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-secondary underline hover:text-accent-secondary/80"
              >
                {trim(tx, 8)}
              </a>
            ) : (
              <Text variant="body2" className="text-accent-secondary">
                {trim(tx, 8)}
              </Text>
            )}
            <CopyButton value={tx} />
          </>
        ) : (
          <Text variant="body2" className="text-accent-secondary">
            Failed
          </Text>
        )}
      </div>
    </div>
  );
}

export function ClaimResultsContent({ results }: { results?: ClaimResult[] }) {
  const { coinSymbol: bbnCoinSymbol } = getNetworkConfigBBN();
  const { coinSymbol: btcCoinSymbol } = getNetworkConfigBTC();

  const btc = results?.find((r) => r.kind === "btc");
  const baby = results?.find((r) => r.kind === "baby");

  return (
    <div className="flex flex-col gap-3">
      <Row title={`${btcCoinSymbol} Staking Transaction`} result={btc} />
      <Row title={`${bbnCoinSymbol} Staking Transaction`} result={baby} />
    </div>
  );
}
