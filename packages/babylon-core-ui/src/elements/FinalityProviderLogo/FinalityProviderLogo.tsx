import { Text } from "../../components/Text";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

interface FinalityProviderLogoProps {
  logoUrl?: string;
  rank: number;
  moniker?: string;
  className?: string;
  size?: "lg" | "md" | "sm";
}

const STYLES = {
  lg: {
    logo: "size-10",
    badge: "text-[60%] size-3",
  },
  md: {
    logo: "size-6",
    badge: "text-[60%] size-3",
  },
  sm: {
    logo: "size-5",
    badge: "text-[60%] size-3",
  },
};

export const FinalityProviderLogo = ({ logoUrl, rank, moniker, size = "md", className }: FinalityProviderLogoProps) => {
  const [imageError, setImageError] = useState(false);
  const styles = STYLES[size];

  const fallbackLabel = moniker?.charAt(0).toUpperCase() ?? String(rank);

  // Determine badge text size based on number of digits in rank
  const rankDigitCount = String(Math.abs(rank)).length;
  const badgeTextSizeClass =
    rankDigitCount === 1 ? "text-[60%]" : rankDigitCount === 2 ? "text-[50%]" : "text-[40%]";

  return (
    <span className={twMerge("relative inline-block", styles.logo, className)}>
      {logoUrl && !imageError ? (
        <img
          src={logoUrl}
          alt={moniker || `Finality Provider ${rank}`}
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
      <span
        className={twMerge(
          "absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-secondary-main text-accent-contrast leading-none border border-accent-primary overflow-hidden",
          styles.badge,
          badgeTextSizeClass,
        )}
      >
        {rank}
      </span>
    </span>
  );
};
