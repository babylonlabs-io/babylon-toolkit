import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const CloseIcon = ({ 
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
        d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z"
        fill="currentColor"
      />
    </svg>
  );
}; 