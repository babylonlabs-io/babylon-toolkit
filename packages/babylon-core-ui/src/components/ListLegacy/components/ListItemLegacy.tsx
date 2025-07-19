import { twJoin } from "tailwind-merge";

import { Text } from "@/components/Text";

export interface ListItemLegacyProps {
  className?: string;
  orientation?: "adaptive" | "horizontal" | "vertical";
  title: string | JSX.Element;
  value: string | JSX.Element;
  suffix?: JSX.Element;
}

export function ListItemLegacy({ className, orientation = "horizontal", title, value, suffix }: ListItemLegacyProps) {
  return (
    <div className={twJoin("bbn-list-item-legacy", `bbn-list-item-legacy-${orientation}`, className)}>
      <Text
        as="div"
        className={twJoin("bbn-list-title-legacy", `bbn-list-title-legacy-${orientation}`)}
        variant={orientation === "horizontal" ? "body1" : "body2"}
      >
        {title}
      </Text>

      <Text
        as="div"
        className={twJoin("bbn-list-value-legacy", `bbn-list-value-legacy-${orientation}`)}
        variant="body1"
      >
        {value}
        {suffix}
      </Text>
    </div>
  );
}
