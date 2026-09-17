import type { ReactNode } from "react";

/** Dialog width shared by the loan overlay's picker steps (Figma: 720px). */
export const LOAN_PICKER_WIDTH_CLASS = "max-w-[720px]";

interface LoanPickerFrameProps {
  title: string;
  children: ReactNode;
}

/**
 * Bordered card with a title bar, shared by the loan overlay's picker steps
 * (Select asset, Select hub, the repay picker) so the three stay aligned.
 */
export function LoanPickerFrame({ title, children }: LoanPickerFrameProps) {
  return (
    <div className="mx-auto w-full rounded-2xl border border-secondary-strokeLight">
      <div className="border-b border-secondary-strokeLight p-6">
        <h3 className="text-2xl text-accent-primary">{title}</h3>
      </div>
      <div className="flex flex-col gap-4 px-6 pb-6 pt-4">{children}</div>
    </div>
  );
}
