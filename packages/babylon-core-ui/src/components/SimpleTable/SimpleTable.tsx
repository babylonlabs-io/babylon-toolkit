import { SubSection } from "@/components/SubSection";
import { Text } from "@/components/Text";
import { twJoin } from "tailwind-merge";
import { ReactNode } from "react";
import "./SimpleTable.css";

interface TableProps {
  data: ReactNode[][];
  headers: string[];
  className?: string;
  tableId?: string; // Optional identifier used to prefix default keys, avoiding collisions when multiple tables render in same page.
}

export const SimpleTable = ({
  data,
  headers,
  className,
  tableId,
}: TableProps) => {
  const gridStyle = {
    gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
  };

  const keyPrefix = tableId ? `${tableId}-` : "";

  return (
    <SubSection className={twJoin("bbn-simple-table-section", className)}>
      <div className="bbn-simple-table">
        <div
          className="bbn-simple-table-header"
          style={gridStyle}
        >
          {headers.map((header, idx) => (
            <Text key={`${keyPrefix}header-${header}-${idx}`} variant="caption" className="bbn-simple-table-header-cell">
              {header}
            </Text>
          ))}
        </div>

        <div className="bbn-simple-table-body">
          {data.map((row, rowIdx) => (
            <div
              key={`${keyPrefix}row-${rowIdx}`}
              className="bbn-simple-table-row"
              style={gridStyle}
            >
              {headers.map((_, cellIdx) => (
                <div
                  key={`${keyPrefix}cell-${rowIdx}-${cellIdx}`}
                  className="bbn-simple-table-cell"
                >
                  {row[cellIdx]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </SubSection>
  );
};