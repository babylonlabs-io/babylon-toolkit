import { FC } from "react";

// Continue Renewal icon - shows a circular refresh/renewal symbol
export const ContinueRenewalIcon: FC<{
  width?: number;
  height?: number;
  className?: string;
}> = ({ width = 20, height = 20, className }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM10.06 17V14.99C10.04 14.99 10.02 14.99 10 14.99C8.72 14.99 7.44 14.5 6.46 13.53C4.75 11.82 4.54 9.18 5.82 7.24L6.92 8.34C6.21 9.67 6.39 11.35 7.51 12.47C8.21 13.17 9.13 13.5 10.05 13.48V11.34L12.88 14.17L10.06 17ZM14.17 12.76L13.07 11.66C13.78 10.33 13.6 8.65 12.48 7.53C11.79 6.84 10.9 6.5 10 6.5C9.98 6.5 9.96 6.5 9.94 6.5V8.65L7.11 5.83L9.94 3V5.02C11.24 5 12.55 5.47 13.54 6.47C15.24 8.17 15.45 10.82 14.17 12.76Z"
      fill="currentColor"
    />
  </svg>
);
