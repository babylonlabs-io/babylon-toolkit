import { type HTMLProps, createElement, forwardRef } from "react";
import { twJoin } from "tailwind-merge";
import "./Text.css";

type Variant = "body1" | "body2" | "subtitle1" | "subtitle2" | "overline" | "caption";

export interface TextProps extends HTMLProps<HTMLElement> {
  variant?: Variant;
  as?: string;
}

export const Text = forwardRef<HTMLElement, TextProps>(
  ({ variant = "body1", as = "p", children, className, ...restProps }, ref) => {
    return createElement(
      as,
      {
        ...restProps,
        ref,
        className: twJoin(`bbn-text-${variant}`, className),
      },
      children,
    );
  },
);

Text.displayName = "Text";
