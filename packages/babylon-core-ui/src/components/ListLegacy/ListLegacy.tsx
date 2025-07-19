import { type PropsWithChildren, Children, cloneElement, isValidElement, ReactElement } from "react";
import "./ListLegacy.css";
import { twMerge } from "tailwind-merge";

import { type ListItemLegacyProps, ListItemLegacy } from "./components/ListItemLegacy";

export interface ListLegacyProps {
  className?: string;
  orientation: "adaptive" | "horizontal" | "vertical";
  children:
    | ReactElement<ListItemLegacyProps, typeof ListItemLegacy>
    | ReactElement<ListItemLegacyProps, typeof ListItemLegacy>[];
}

const ROW_ORIENTATION = {
  adaptive: "adaptive",
  horizontal: "vertical",
  vertical: "horizontal",
} as const;

export function ListLegacy({ className, orientation = "vertical", children }: PropsWithChildren<ListLegacyProps>) {
  return (
    <div className={twMerge("bbn-list-legacy", `bbn-list-legacy-${orientation}`, className)}>
      {Children.map(children, (item) =>
        isValidElement(item)
          ? cloneElement(item, {
              orientation: ROW_ORIENTATION[orientation],
            })
          : item,
      )}
    </div>
  );
}
