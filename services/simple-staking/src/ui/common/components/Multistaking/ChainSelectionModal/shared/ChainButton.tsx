import { Button, FinalityProviderItem } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

import { ThreeDotsMenu } from "@/ui/common/components/ThreeDotsMenu/ThreeDotsMenu";

import { ChainButtonProps } from "./types";

export const ChainButton = ({
  disabled,
  title,
  provider,
  bsnId,
  bsnName,
  logoUrl,
  subContent,
  onSelectFp,
  onRemove,
  isExisting = false,
}: ChainButtonProps) => (
  <div
    className={twMerge(
      "flex w-full items-center justify-between rounded bg-secondary-highlight px-[14px] py-[14px]",
      disabled ? "opacity-50" : "",
    )}
  >
    <div className="flex items-center text-base">
      <div className="w-full">
        {provider ? (
          <FinalityProviderItem
            bsnId={bsnId || ""}
            bsnName={bsnName || ""}
            provider={provider}
            subContent={subContent}
            onRemove={isExisting ? undefined : () => onRemove?.(bsnId || "")}
          />
        ) : (
          <FinalityProviderItem
            bsnId={""}
            bsnName={""}
            provider={{
              logo_url: logoUrl,
              rank: 0,
              description: {
                moniker: typeof title === "string" ? title : "",
              },
            }}
            subContent={subContent}
            showChain={false}
          />
        )}
      </div>
    </div>
    {provider ? (
      <ThreeDotsMenu
        onChange={() => {
          if (bsnId) {
            onRemove?.(bsnId);
          }
          onSelectFp?.();
        }}
        onRemove={() => onRemove?.(bsnId || "")}
        className="rounded p-1 hover:bg-secondary-highlight"
      />
    ) : isExisting ? (
      <ThreeDotsMenu
        onChange={() => {
          if (bsnId) {
            onRemove?.(bsnId);
          }
          onSelectFp?.();
        }}
        onRemove={() => onRemove?.(bsnId || "")}
        className="rounded p-1 hover:bg-secondary-highlight"
      />
    ) : (
      <Button
        variant="outlined"
        disabled={disabled}
        onClick={onSelectFp}
        className="box-border flex h-[28px] w-[86px] items-center justify-center rounded border border-secondary-strokeDark p-1 text-sm text-accent-primary"
      >
        Select FP
      </Button>
    )}
  </div>
);
