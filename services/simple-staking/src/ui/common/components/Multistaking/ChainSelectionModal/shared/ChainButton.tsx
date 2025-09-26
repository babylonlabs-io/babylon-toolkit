import { Button, FinalityProviderItem } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

import {
  ThreeDotsMenu,
  ThreeDotsMenuItem,
} from "@/ui/common/components/ThreeDotsMenu/ThreeDotsMenu";

import { ChainButtonProps } from "./types";

export const ChainButton = ({
  disabled,
  title,
  provider,
  bsnId,
  bsnName,
  logoUrl,
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
      {provider ? (
        <div className="w-full">
          <FinalityProviderItem
            bsnId={bsnId || ""}
            bsnName={bsnName || ""}
            provider={provider}
            onRemove={isExisting ? undefined : () => onRemove?.(bsnId || "")}
          />
        </div>
      ) : (
        <>
          {logoUrl && (
            <img
              src={logoUrl}
              alt="chain-logo"
              className="mr-2 max-h-[40px] max-w-[40px] rounded-full"
            />
          )}
          {title}
        </>
      )}
    </div>
    {provider ? (
      <ThreeDotsMenu
        className="rounded p-1 hover:bg-secondary-highlight"
        buttonClassName="p-1"
      >
        <ThreeDotsMenuItem
          onClick={() => {
            if (bsnId) {
              onRemove?.(bsnId);
            }
            onSelectFp?.();
          }}
        >
          Change FP
        </ThreeDotsMenuItem>
        <ThreeDotsMenuItem onClick={() => onRemove?.(bsnId || "")}>
          Remove BSN
        </ThreeDotsMenuItem>
      </ThreeDotsMenu>
    ) : isExisting ? (
      <ThreeDotsMenu
        className="rounded p-1 hover:bg-secondary-highlight"
        buttonClassName="p-1"
      >
        <ThreeDotsMenuItem
          onClick={() => {
            if (bsnId) {
              onRemove?.(bsnId);
            }
            onSelectFp?.();
          }}
        >
          Change FP
        </ThreeDotsMenuItem>
        <ThreeDotsMenuItem onClick={() => onRemove?.(bsnId || "")}>
          Remove BSN
        </ThreeDotsMenuItem>
      </ThreeDotsMenu>
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
