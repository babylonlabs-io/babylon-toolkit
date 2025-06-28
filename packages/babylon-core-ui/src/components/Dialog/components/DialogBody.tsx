import type { DetailedHTMLProps, HTMLAttributes } from "react";
import { twJoin } from "tailwind-merge";

export const DialogBody = (props: DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>) => (
  <div {...props} className={twJoin("bbn-dialog-body", props.className)} />
);
