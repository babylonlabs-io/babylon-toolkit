import { DetailedHTMLProps, HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";
import "./IconButton.css";

export type IconButtonProps = DetailedHTMLProps<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;

export const IconButton = ({ className, ...restProps }: IconButtonProps) => {
  return <button {...restProps} className={twJoin("bbn-btn-icon", className)} />;
};
