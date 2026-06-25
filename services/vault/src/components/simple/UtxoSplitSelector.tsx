import { Accordion, AccordionDetails, Card } from "@babylonlabs-io/core-ui";
import { IoCheckmark, IoChevronUp } from "react-icons/io5";

import { PARTIAL_LIQUIDATION_DOCS_URL } from "@/constants";
import { COPY } from "@/copy";

interface PartialLiquidationProps {
  isEnabled: boolean;
  onChange: (checked: boolean) => void;
  canSplit: boolean;
  isLoading: boolean;
  splitRatioLabel: string | null;
}

interface UtxoSplitSelectorProps {
  partialLiquidation: PartialLiquidationProps;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function UtxoSplitSelector({
  partialLiquidation,
  expanded,
  onExpandedChange,
}: UtxoSplitSelectorProps) {
  const splitDisabled =
    !partialLiquidation.canSplit || partialLiquidation.isLoading;

  const handleSelectSplit = () => {
    if (splitDisabled) return;
    partialLiquidation.onChange(true);
  };
  const handleSelectNoSplit = () => partialLiquidation.onChange(false);

  const splitTitleColor = partialLiquidation.isEnabled
    ? "text-accent-primary"
    : "text-accent-secondary";
  const noSplitTitleColor = partialLiquidation.isEnabled
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
            {partialLiquidation.isEnabled ? (
              <>
                {COPY.deposit.form.splitOptionLabel(
                  partialLiquidation.splitRatioLabel,
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
                  partialLiquidation.splitRatioLabel,
                )}{" "}
                <span className="text-accent-secondary">
                  {COPY.deposit.form.splitOptionRecommended}
                </span>
              </span>
              <span className="text-xs text-accent-secondary">
                {COPY.deposit.form.splitOptionDescription}{" "}
                <a
                  href={PARTIAL_LIQUIDATION_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-main underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {COPY.deposit.form.learnMore}
                </a>
              </span>
            </span>
            {partialLiquidation.isEnabled && (
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
            {!partialLiquidation.isEnabled && (
              <IoCheckmark className="shrink-0 text-accent-primary" size={20} />
            )}
          </div>

          {partialLiquidation.isLoading && (
            <span className="text-xs text-accent-secondary">
              {COPY.deposit.form.computingAllocation}
            </span>
          )}
        </Card>
      </AccordionDetails>
    </Accordion>
  );
}
