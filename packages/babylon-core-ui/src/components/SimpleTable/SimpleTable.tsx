import { SubSection } from "@/components/SubSection";
import { Text } from "@/components/Text";
import { twJoin } from "tailwind-merge";
import { ReactNode, useId } from "react";
import "./SimpleTable.css";

interface TableProps {
  data: ReactNode[][];
  headers: string[];
  className?: string;
}

export const SimpleTable = ({
  data,
  headers,
  className,
}: TableProps) => {
  const generatedId = useId(); // Avoid collisions when multiple tables render in same page.

  const gridStyle = {
    gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
  };

  return (
    <SubSection className={twJoin("bbn-simple-table-section", className)}>
      <div className="bbn-simple-table">
        <div
          className="bbn-simple-table-header"
          style={gridStyle}
        >
          {headers.map((header, idx) => (
            <Text key={`${generatedId}-header-${header}-${idx}`} variant="caption" className="bbn-simple-table-header-cell">
              {header}
            </Text>
          ))}
        </div>

        <div className="bbn-simple-table-body">
          {data.map((row, rowIdx) => (
            <div
              key={`${generatedId}-row-${rowIdx}`}
              className="bbn-simple-table-row"
              style={gridStyle}
            >
              {headers.map((_, cellIdx) => (
                <div
                  key={`${generatedId}-cell-${rowIdx}-${cellIdx}`}
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