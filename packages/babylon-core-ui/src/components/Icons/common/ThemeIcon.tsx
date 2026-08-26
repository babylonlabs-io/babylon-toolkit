import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const ThemeIcon = ({
  className = "",
  size = 40,
  variant = "default",
  color,
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];

  return (
    <svg
      style={{ width: size, height: size }}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", className)}
    >
      <rect width="40" height="40" rx="20" fill="currentColor" fillOpacity="0.12" />
      <path
        d="M20 30C25.52 30 30 25.52 30 20C30 14.48 25.52 10 20 10C14.48 10 10 14.48 10 20C10 25.52 14.48 30 20 30ZM21 12.07C24.94 12.56 28 15.92 28 20C28 24.08 24.95 27.44 21 27.93V12.07Z"
        fill="currentColor"
        className={colorClass}
      />
    </svg>
  );
};