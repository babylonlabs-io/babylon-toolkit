import { twJoin } from "tailwind-merge";
import { iconColorVariants, IconProps } from "../index";

export const ChevronRightIcon = ({
  className = "",
  size = 16,
  variant = "default",
  color,
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];

  return (
    <svg
      style={{ width: size, height: size }}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin(
        "transition-opacity duration-200",
        colorClass,
        className,
      )}
    >
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
