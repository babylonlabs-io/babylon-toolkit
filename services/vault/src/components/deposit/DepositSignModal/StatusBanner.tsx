import { Text } from "@babylonlabs-io/core-ui";

interface StatusBannerProps {
  variant: "error" | "success";
  children: React.ReactNode;
}

const VARIANT_STYLES = {
  error: "bg-error-main/10 text-error-main",
  success: "bg-success-main/10 text-success-main",
} as const;

/**
 * Reusable status banner for error and success messages
 */
export function StatusBanner({ variant, children }: StatusBannerProps) {
  return (
    <div className={`rounded-lg p-4 ${VARIANT_STYLES[variant]}`}>
      <Text variant="body2" className="text-sm">
        {children}
      </Text>
    </div>
  );
}
