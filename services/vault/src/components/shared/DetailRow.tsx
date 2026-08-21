/**
 * Shared v3 label/value rows, the counterpart to `ListRow` for surfaces that
 * present a stack of metrics rather than a list of records.
 *
 * `FeeDetailRow` is the fee line from Figma "Fees" (4110-65950): a body2 label
 * on the left — carrying core-ui's 16px info icon when it has a tooltip — and a
 * right-aligned amount whose USD conversion trails it in secondary text. The
 * deposit breakdown and the protocol-parameter panel both render through it so
 * the two lists on the deposit form stay one row system.
 *
 * `ReviewDetailRow` is the confirm-screen line from Figma "Review Withdraw"
 * (10088-38704): a body1 label on the left and a right-aligned value whose
 * conversion sits on a second, secondary line rather than trailing it. The
 * withdraw and refund review cards share it.
 *
 * Not a core-ui component: the pairing of app copy, tooltip and conversion
 * suffix is vault-specific, and core-ui has no equivalent primitive.
 */

import { Hint } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

interface FeeDetailRowProps {
  label: ReactNode;
  tooltip?: string;
  value: ReactNode;
  /** Trailing conversion (e.g. "($12.24 USD)"), rendered in secondary text. */
  secondaryValue?: ReactNode;
  /** Renders the value in the error colour without changing its text. */
  valueIsError?: boolean;
}

export function FeeDetailRow({
  label,
  tooltip,
  value,
  secondaryValue,
  valueIsError = false,
}: FeeDetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-6 text-sm leading-[1.43] tracking-[0.17px]">
      {tooltip ? (
        <Hint tooltip={tooltip}>
          <span>{label}</span>
        </Hint>
      ) : (
        <span className="text-accent-primary">{label}</span>
      )}
      <span className="text-right">
        <span
          className={valueIsError ? "text-error-main" : "text-accent-primary"}
        >
          {value}
        </span>
        {secondaryValue ? (
          <span className="text-accent-secondary"> {secondaryValue}</span>
        ) : null}
      </span>
    </div>
  );
}

interface ReviewDetailRowProps {
  label: string;
  value: ReactNode;
  /** Sub-line under the value (e.g. the USD conversion), in secondary text. */
  secondaryValue?: ReactNode;
}

export function ReviewDetailRow({
  label,
  value,
  secondaryValue,
}: ReviewDetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-6 text-base leading-[1.5] tracking-[0.15px]">
      <span className="text-accent-primary">{label}</span>
      <div className="flex flex-col items-end text-right text-accent-primary">
        {value}
        {secondaryValue ? (
          <span className="text-accent-secondary">{secondaryValue}</span>
        ) : null}
      </div>
    </div>
  );
}
