import { Text } from "@babylonlabs-io/core-ui";

import { Hash } from "@/ui/common/components/Hash/Hash";
import { BABYLON_EXPLORER } from "@/ui/common/constants";
import { trim } from "@/ui/common/utils/trim";

export const SuccessContent = ({
  transactionHash,
}: {
  transactionHash: string[];
}) => {
  const hashes = transactionHash.filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <Text variant="body1" className="text-center">
        Your claim has been submitted and will be processed in 2 blocks.
      </Text>
      {hashes.length > 0 && (
        <div className="flex flex-col gap-2">
          {hashes.map((hash, index) => (
            <div
              key={hash}
              className="flex flex-col items-center justify-center sm:flex-row"
            >
              <Text variant="body2" className="mb-1 sm:mb-0 sm:mr-2">
                {hashes.length > 1
                  ? `Transaction Hash ${index + 1}:`
                  : "Transaction Hash:"}
              </Text>
              {BABYLON_EXPLORER ? (
                <a
                  href={`${BABYLON_EXPLORER}/transaction/${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-center text-primary-light underline hover:text-primary-light/80"
                >
                  {trim(hash, 8)}
                </a>
              ) : (
                <Hash noFade value={hash} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
