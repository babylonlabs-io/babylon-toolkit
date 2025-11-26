import { Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";

interface ApplicationLogoProps {
  logoUrl: string | null;
  name: string;
  size?: "small" | "large";
  shape?: "circle" | "rounded";
}

export function ApplicationLogo({
  logoUrl,
  name,
  size = "large",
  shape = "circle",
}: ApplicationLogoProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = size === "small" ? "h-8 w-8" : "h-10 w-10";
  const shapeClasses = shape === "circle" ? "rounded-full" : "rounded-2xl";

  if (imageError || !logoUrl) {
    return (
      <div
        className={`flex ${sizeClasses} items-center justify-center overflow-hidden ${shapeClasses} bg-secondary-main`}
      >
        <Text as="span" className="text-base font-medium text-accent-contrast">
          {name.charAt(0).toUpperCase()}
        </Text>
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      className={`${sizeClasses} ${shapeClasses} object-cover`}
      onError={() => setImageError(true)}
    />
  );
}
