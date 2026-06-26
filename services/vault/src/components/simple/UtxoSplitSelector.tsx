import { Accordion, AccordionDetails, Card } from "@babylonlabs-io/core-ui";
import { IoCheckmark, IoChevronUp } from "react-icons/io5";

import { TWO_VAULT_SPLIT_DOCS_URL } from "@/constants";
import { COPY } from "@/copy";

export interface TwoVaultSplitProps {
  isEnabled: boolean;
  onChange: (checked: boolean) => void;
  canSplit: boolean;
  isLoading: boolean;
  splitRatioLabel: string | null;
  minDepositForSplit: bigint;
  isSplitAmountTooLow: boolean;
}

interface UtxoSplitSelectorProps {
  twoVaultSplit: TwoVaultSplitProps;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function UtxoSplitSelector({
  twoVaultSplit,
  expanded,
  onExpandedChange,
}: UtxoSplitSelectorProps) {
  const splitDisabled = !twoVaultSplit.canSplit || twoVaultSplit.isLoading;

  const handleSelectSplit = () => {
    if (splitDisabled) return;
    twoVaultSplit.onChange(true);
  };
  const handleSelectNoSplit = () => twoVaultSplit.onChange(false);

  const splitTitleColor = twoVaultSplit.isEnabled
    ? "text-accent-primary"
    : "text-accent-secondary";
  const noSplitTitleColor = twoVaultSplit.isEnabled
    ? "text-accent-secondary"
    : "text-accent-primary";

  return (
    <Accordion expanded={expanded}>
      <Card variant="filled" className="!rounded-lg !p-0">
        <button
          type="button"
          className="flex w-full items-center justify-between px-6 py-4"
          onClick={() => onExpandedChange(!expanded)}
        >
          <span className="text-sm text-accent-primary">
            {twoVaultSplit.isEnabled ? (
              <>
                {COPY.deposit.form.splitOptionLabel(
                  twoVaultSplit.splitRatioLabel,
                )}{" "}
                <span className="text-accent-secondary">
                  {COPY.deposit.form.splitOptionRecommended}
                </span>
              </>
            ) : (
              COPY.deposit.form.doNotSplit
            )}
          </span>
          <IoChevronUp
            className={`text-accent-primary transition-transform ${expanded ? "" : "rotate-180"}`}
          />
        </button>
      </Card>

      <AccordionDetails className="pt-4">
        <Card
          variant="default"
          className="flex w-full flex-col gap-6 !rounded-lg !bg-primary-contrast !py-4"
        >
          <div
            role="button"
            tabIndex={splitDisabled ? -1 : 0}
            aria-disabled={splitDisabled}
            className={`flex w-full items-start justify-between gap-3 text-left ${splitDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            onClick={handleSelectSplit}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelectSplit();
              }
            }}
          >
            <span className="flex flex-col gap-1">
              <span className={`text-sm ${splitTitleColor}`}>
                {COPY.deposit.form.splitOptionLabel(
                  twoVaultSplit.splitRatioLabel,
                )}{" "}
                <span className="text-accent-secondary">
                  {COPY.deposit.form.splitOptionRecommended}
                </span>
              </span>
              <span className="text-xs text-accent-secondary">
                {COPY.deposit.form.splitOptionDescription}{" "}
                <a
                  href={TWO_VAULT_SPLIT_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-main underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {COPY.deposit.form.learnMore}
                </a>
              </span>
            </span>
            {twoVaultSplit.isEnabled && (
              <IoCheckmark className="shrink-0 text-accent-primary" size={20} />
            )}
          </div>

          <div
            role="button"
            tabIndex={0}
            className="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
            onClick={handleSelectNoSplit}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelectNoSplit();
              }
            }}
          >
            <span className="flex flex-col gap-1">
              <span className={`text-sm ${noSplitTitleColor}`}>
                {COPY.deposit.form.doNotSplit}
              </span>
              <span className="text-xs text-accent-secondary">
                {COPY.deposit.form.noSplitOptionDescription}
              </span>
            </span>
            {!twoVaultSplit.isEnabled && (
              <IoCheckmark className="shrink-0 text-accent-primary" size={20} />
            )}
          </div>

          {twoVaultSplit.isLoading && (
            <span className="text-xs text-accent-secondary">
              {COPY.deposit.form.computingAllocation}
            </span>
          )}
        </Card>
      </AccordionDetails>
    </Accordion>
  );
}
