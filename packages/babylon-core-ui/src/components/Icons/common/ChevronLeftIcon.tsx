import { twJoin } from "tailwind-merge";
import { iconColorVariants, IconProps } from "../index";

export const ChevronLeftIcon = ({
  className = "",
  size = 16,
  variant = "default",
  color
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];

  return (
    <svg
      style={{ width: size, height: size }}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", colorClass, className)}
    >
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
