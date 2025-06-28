import { type PropsWithChildren, type HTMLAttributes, type ReactNode } from "react";
import { twJoin } from "tailwind-merge";

import { Text } from "@/components/Text";

interface CellProps {
  className?: string;
  render?: (value: unknown) => ReactNode;
  columnName?: string;
  value: unknown;
}

export function Cell({
  className,
  render,
  value,
  columnName,
  ...restProps
}: PropsWithChildren<CellProps & HTMLAttributes<HTMLTableCellElement>>) {
  return (
    <Text
      variant="body2"
      as="td"
      className={twJoin(`bbn-cell-left`, className)}
      data-column={columnName}
      {...restProps}
    >
      {render ? render(value) : (value as ReactNode)}
    </Text>
  );
}
