import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const PauseIcon = ({
  className = "",
  size = 14,
  variant = "default",
  color,
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];
  const ASPECT_RATIO = 1; // 14/14 = 1

  return (
    <svg
      style={{ width: size, height: size * ASPECT_RATIO }}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", colorClass, className)}
    >
      <rect x="3" y="2" width="2.5" height="10" rx="1" fill="currentColor" />
      <rect x="8.5" y="2" width="2.5" height="10" rx="1" fill="currentColor" />
    </svg>
  );
};
