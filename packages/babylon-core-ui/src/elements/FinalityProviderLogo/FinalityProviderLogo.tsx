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
    subLogo: "text-[0.8rem]",
  },
  md: {
    logo: "size-6",
    subLogo: "text-[0.5rem]",
  },
  sm: {
    logo: "size-5",
    subLogo: "text-[0.4rem]",
  },
};

export const FinalityProviderLogo = ({ logoUrl, rank, moniker, size = "md", className }: FinalityProviderLogoProps) => {
  const [imageError, setImageError] = useState(false);
  const styles = STYLES[size];

  const fallbackLabel = moniker?.charAt(0).toUpperCase() ?? String(rank);

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
    </span>
  );
};
