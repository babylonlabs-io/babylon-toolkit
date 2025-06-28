import { type PropsWithChildren, createElement } from "react";
import { twJoin } from "tailwind-merge";
import "./Card.css";

interface CardProps extends PropsWithChildren {
  as?: string;
  className?: string;
}

export function Card({ as = "div", className, children }: CardProps) {
  return createElement(as, { className: twJoin("bbn-card", className) }, children);
}
