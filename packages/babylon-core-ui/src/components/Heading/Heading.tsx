import { createElement, forwardRef, type HTMLProps } from "react";
import { twJoin } from "tailwind-merge";
import "./Heading.css";

type HeadingVariant = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface HeadingProps extends HTMLProps<HTMLElement> {
  variant: HeadingVariant;
  as?: string;
}

export const Heading = forwardRef<HTMLElement, HeadingProps>(
  ({ variant, as = variant, children, className, ...restProps }, ref) =>
    createElement(
      as,
      {
        ...restProps,
        ref,
        className: twJoin(`bbn-${variant}`, className),
      },
      children,
    ),
);

Heading.displayName = "Heading";
