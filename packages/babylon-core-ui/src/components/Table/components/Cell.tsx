import { type PropsWithChildren, type HTMLAttributes, type ReactNode } from "react";
import { twJoin } from "tailwind-merge";

import { Text } from "@/components/Text";

interface CellProps {
  className?: string;
  render?: (value: unknown) => ReactNode;
  columnName?: string;
  value: unknown;
  frozen?: 'left' | 'right';
  showFrozenShadow?: boolean;
}

export function Cell({
  className,
  render,
  value,
  columnName,
  frozen,
  showFrozenShadow,
  ...restProps
}: PropsWithChildren<CellProps & HTMLAttributes<HTMLTableCellElement>>) {
  const frozenClasses = frozen ? `bbn-table-frozen bbn-table-frozen-${frozen}` : '';
  const shadowClass = frozen && showFrozenShadow ? 'bbn-frozen-shadow' : '';

  return (
    <Text
      variant="body2"
      as="td"
      className={twJoin(`bbn-cell-left`, frozenClasses, shadowClass, className)}
      data-column={columnName}
      {...restProps}
    >
      {render ? render(value) : (value as ReactNode)}
    </Text>
  );
}
