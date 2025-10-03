import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const PlusIcon = ({
  className = "",
  size = 14,
  variant = "default",
  color
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];

  return (
    <svg
      style={{ width: size, height: size }}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", colorClass, className)}
    >
      <path 
        d="M14 8H8V14H6V8H0V6H6V0H8V6H14V8Z" 
        fill="currentColor"
      />
    </svg>
  );
};

