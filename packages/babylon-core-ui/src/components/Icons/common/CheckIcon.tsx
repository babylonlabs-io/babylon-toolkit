import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const CheckIcon = ({ 
  className = "", 
  size = 16, 
  variant = "default",
  color
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", colorClass, className)}
    >
      <path
        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
        fill="currentColor"
      />
    </svg>
  );
};

