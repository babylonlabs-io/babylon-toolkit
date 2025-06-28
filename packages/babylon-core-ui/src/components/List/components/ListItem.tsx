import { twJoin } from "tailwind-merge";

import { Text } from "@/components/Text";

export interface ListItemProps {
  className?: string;
  orientation?: "adaptive" | "horizontal" | "vertical";
  title: string | JSX.Element;
  value: string | JSX.Element;
  suffix?: JSX.Element;
}

export function ListItem({ className, orientation = "horizontal", title, value, suffix }: ListItemProps) {
  return (
    <div className={twJoin("bbn-list-item", `bbn-list-item-${orientation}`, className)}>
      <Text
        as="div"
        className={twJoin("bbn-list-title", `bbn-list-title-${orientation}`)}
        variant={orientation === "horizontal" ? "body1" : "body2"}
      >
        {title}
      </Text>

      <Text as="div" className={twJoin("bbn-list-value", `bbn-list-value-${orientation}`)} variant="body1">
        {value}
        {suffix}
      </Text>
    </div>
  );
}
