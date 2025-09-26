import { ContinueRenewalIcon } from "./ContinueRenewalIcon";

interface ContinueRenewalMessageProps {
  className?: string;
}

// Banner follows design system tokens and icon conventions
export function ContinueRenewalMessage({
  className,
}: ContinueRenewalMessageProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg p-3 ${className || ""} bg-primary-contrast dark:bg-[#202020]`}
    >
      <div className="mt-0.5">
        <ContinueRenewalIcon
          width={20}
          height={20}
          className="text-accent-primary"
        />
      </div>
      <div className="flex-1">
        <h4 className="mb-1 text-sm font-bold text-accent-primary sm:text-base">
          Continue Renewal
        </h4>
        <p className="text-xs text-accent-secondary sm:text-sm">
          Your renewal request has been verified by Babylon. Please sign and
          submit the Bitcoin transaction to complete the process.
        </p>
      </div>
    </div>
  );
}
