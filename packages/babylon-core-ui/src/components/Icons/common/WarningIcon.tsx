import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const WarningIcon = ({ 
  className = "", 
  size = 22, 
  variant = "default",
  color
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];
  const ASPECT_RATIO = 22 / 20;
  
  return (
    <svg
      style={{ width: size, height: size * ASPECT_RATIO }}
      viewBox="0 0 22 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", colorClass, className)}
    >
      <path
        d="M0 19.5H22L11 0.5L0 19.5ZM12 16.5H10V14.5H12V16.5ZM12 12.5H10V8.5H12V12.5Z"
        fill="currentColor"
      />
    </svg>
  );
}; 