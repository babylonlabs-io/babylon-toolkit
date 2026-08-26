import { type PropsWithChildren, Children, cloneElement, isValidElement, ReactElement } from "react";
import "./List.css";
import { twMerge } from "tailwind-merge";

import { type ListItemProps, ListItem } from "./components/ListItem";

export interface ListProps {
  className?: string;
  orientation: "adaptive" | "horizontal" | "vertical";
  children: ReactElement<ListItemProps, typeof ListItem> | ReactElement<ListItemProps, typeof ListItem>[];
}

const ROW_ORIENTATION = {
  adaptive: "adaptive",
  horizontal: "vertical",
  vertical: "horizontal",
} as const;

export function List({ className, orientation = "vertical", children }: PropsWithChildren<ListProps>) {
  return (
    <div className={twMerge("bbn-list", `bbn-list-${orientation}`, className)}>
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
