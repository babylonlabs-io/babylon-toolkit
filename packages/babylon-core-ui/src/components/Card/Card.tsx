import { type PropsWithChildren, createElement } from "react";
import { twJoin } from "tailwind-merge";
import "./Card.css";

interface CardProps extends PropsWithChildren {
  as?: string;
  variant?: "default" | "filled";
  className?: string;
}

export function Card({ as = "div", variant = "default", className, children }: CardProps) {
  return createElement(as, { className: twJoin(`bbn-card-${variant}`, className) }, children);
}
