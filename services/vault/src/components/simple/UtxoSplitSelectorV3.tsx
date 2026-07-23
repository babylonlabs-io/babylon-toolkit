import { Accordion, AccordionDetails, Card } from "@babylonlabs-io/core-ui";
import { IoCheckmark, IoChevronUp } from "react-icons/io5";

import { TWO_VAULT_SPLIT_DOCS_URL } from "@/constants";
import { COPY } from "@/copy";

/**
 * Split state driving the picker. Declared here (rather than imported from the
 * v2 file) so the v2 selector can be deleted whole when ENABLE_V3_UI retires.
 */
export interface TwoVaultSplitProps {
  isEnabled: boolean;
  onChange: (checked: boolean) => void;
  canSplit: boolean;
  isLoading: boolean;
  splitRatioLabel: string | null;
  minDepositForSplit: bigint;
  isSplitAmountTooLow: boolean;
}

export interface UtxoSplitSelectorProps {
  twoVaultSplit: TwoVaultSplitProps;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

const FORM_COPY = COPY.deposit.form;

export function UtxoSplitSelectorV3({
  twoVaultSplit,
  expanded,
  onExpandedChange,
}: UtxoSplitSelectorProps) {
  const splitDisabled = !twoVaultSplit.canSplit || twoVaultSplit.isLoading;

  // Picking an option collapses the panel, matching the vault provider picker.
  const select = (enabled: boolean) => {
    twoVaultSplit.onChange(enabled);
    onExpandedChange(false);
  };
  const handleSelectSplit = () => {
    if (splitDisabled) return;
    select(true);
  };
  const handleSelectNoSplit = () => select(false);

  const splitTitleColor = twoVaultSplit.isEnabled
    ? "text-accent-primary"
    : "text-accent-secondary";
  const noSplitTitleColor = twoVaultSplit.isEnabled
    ? "text-accent-secondary"
    : "text-accent-primary";

  // Selected option is filled; the unselected one keeps the same padding so
  // the two rows stay aligned. The card clips the corners, so the top option
  // can never show bottom corners (and vice versa).
  const optionBox = (selected: boolean) =>
    `p-4${selected ? " bg-primary-contrast" : ""}`;

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
                {FORM_COPY.splitOptionLabel(twoVaultSplit.splitRatioLabel)}{" "}
                <span className="text-accent-secondary">
                  {FORM_COPY.splitOptionRecommended}
                </span>
              </>
            ) : (
              FORM_COPY.doNotSplit
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
          className="flex w-full flex-col overflow-hidden !rounded-lg !bg-transparent !p-0"
        >
          <div
            role="button"
            tabIndex={splitDisabled ? -1 : 0}
            aria-disabled={splitDisabled}
            className={`flex w-full items-start justify-between gap-3 text-left ${splitDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${optionBox(twoVaultSplit.isEnabled)}`}
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
                {FORM_COPY.splitOptionLabel(twoVaultSplit.splitRatioLabel)}{" "}
                <span className="text-accent-secondary">
                  {FORM_COPY.splitOptionRecommended}
                </span>
              </span>
              <span className="text-xs text-accent-secondary">
                {FORM_COPY.splitOptionDescription}{" "}
                <a
                  href={TWO_VAULT_SPLIT_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-main underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {FORM_COPY.learnMore}
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
            className={`flex w-full cursor-pointer items-start justify-between gap-3 text-left ${optionBox(!twoVaultSplit.isEnabled)}`}
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
                {FORM_COPY.doNotSplit}
              </span>
              <span className="text-xs text-accent-secondary">
                {FORM_COPY.noSplitOptionDescription}
              </span>
            </span>
            {!twoVaultSplit.isEnabled && (
              <IoCheckmark className="shrink-0 text-accent-primary" size={20} />
            )}
          </div>

          {twoVaultSplit.isLoading && (
            <span className="px-4 pb-4 text-xs text-accent-secondary">
              {FORM_COPY.computingAllocation}
            </span>
          )}
        </Card>
      </AccordionDetails>
    </Accordion>
  );
}
