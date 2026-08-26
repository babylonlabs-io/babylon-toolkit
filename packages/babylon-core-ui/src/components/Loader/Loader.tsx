import { twMerge } from "tailwind-merge";
import "./Loader.css";

interface LoaderProps {
  className?: string;
  size?: number;
}

export function Loader({ size = 40, className }: LoaderProps) {
  return (
    <span className={twMerge("bbn-loader text-current", className)} style={{ width: size, height: size }}>
      <svg viewBox="22 22 44 44">
        <circle cx="44" cy="44" r="20.2" fill="none" stroke="currentColor" strokeWidth="3.6" />
      </svg>
    </span>
  );
}
