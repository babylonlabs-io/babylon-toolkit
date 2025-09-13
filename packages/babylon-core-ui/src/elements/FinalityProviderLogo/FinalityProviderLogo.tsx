import { Text } from "../../components/Text";
import { Badge } from "../../components/Badge";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

interface FinalityProviderLogoProps {
  logoUrl?: string;
  rank?: number;
  moniker?: string;
  className?: string;
  size?: "lg" | "md" | "sm";
}

const STYLES = {
  lg: {
    logo: "size-10",
    badge: "!min-w-5 !h-5",
    badgeText: "!text-xs",
  },
  md: {
    logo: "size-6",
    badge: "!min-w-4 !h-4 !px-0.5",
    badgeText: "!text-[10px]",
  },
  sm: {
    logo: "size-5",
    badge: "!min-w-3 !h-3 !px-0.5",
    badgeText: "!text-[8px]",
  },
};

export const FinalityProviderLogo = ({ logoUrl, rank, moniker, size = "md", className }: FinalityProviderLogoProps) => {
  const [imageError, setImageError] = useState(false);
  const styles = STYLES[size];

  const hasRank = typeof rank === "number" && !Number.isNaN(rank);
  const fallbackLabel = moniker?.charAt(0).toUpperCase() ?? (hasRank ? String(rank) : "?");


  return (
    <Badge
      count={hasRank ? rank : undefined}
      position="bottom-right"
      color="secondary"
      className={twMerge(styles.logo, className)}
      badgeClassName={twMerge("border border-accent-contrast overflow-hidden", styles.badge)}
      contentClassName={styles.badgeText}
      max={99}
    >
      {logoUrl && !imageError ? (
        <img
          src={logoUrl}
          alt={moniker || (hasRank ? `Finality Provider ${rank}` : "Finality Provider")}
          className="h-full w-full rounded-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <Text
          as="span"
          className="inline-flex h-full w-full items-center justify-center rounded-full bg-secondary-main text-[1rem] text-accent-contrast"
        >
          {fallbackLabel}
        </Text>
      )}
    </Badge>
  );
};
