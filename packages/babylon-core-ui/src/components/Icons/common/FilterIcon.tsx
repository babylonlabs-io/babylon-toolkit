import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const FilterIcon = ({ 
  className = "", 
  size = 18, 
  variant = "default",
  color
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", colorClass, className)}
    >
      <path
        d="M0 14V16H6V14H0ZM0 2V4H10V2H0ZM10 18V16H18V14H10V12H8V18H10ZM4 6V8H0V10H4V12H6V6H4ZM18 10V8H8V10H18ZM12 6H14V4H18V2H14V0H12V6Z"
        fill="currentColor"
      />
    </svg>
  );
};

