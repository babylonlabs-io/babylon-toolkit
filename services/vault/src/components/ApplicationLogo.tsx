import { Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";

interface ApplicationLogoProps {
  logoUrl: string | null;
  name: string;
  size?: "xs" | "small" | "large";
  shape?: "circle" | "rounded";
}

const SIZE_CLASSES: Record<
  NonNullable<ApplicationLogoProps["size"]>,
  string
> = {
  xs: "h-4 w-4",
  small: "h-8 w-8",
  large: "h-10 w-10",
};

export function ApplicationLogo({
  logoUrl,
  name,
  size = "large",
  shape = "circle",
}: ApplicationLogoProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = SIZE_CLASSES[size];
  const shapeClasses = shape === "circle" ? "rounded-full" : "rounded-2xl";

  if (imageError || !logoUrl) {
    return (
      <div
        className={`flex ${sizeClasses} items-center justify-center overflow-hidden ${shapeClasses} bg-secondary-main`}
      >
        <Text
          as="span"
          className={`font-medium text-accent-contrast ${size === "xs" ? "text-[10px]" : "text-base"}`}
        >
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
