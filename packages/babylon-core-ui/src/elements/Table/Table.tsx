import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { ReactNode } from "react";

interface TableProps {
    data: ReactNode[][];
}

export const Table = ({ data }: TableProps) => {
    if (!data || data.length === 0) return null;

    const headers = data[0];
    const rows = data.slice(1);
    const columnCount = headers.length;

    const gridStyle = {
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
    } as const;

    return (
        <Card className="p-6 pt-4">
            <div className="flex flex-col">
                <div
                    className="items-center gap-4 pb-4 grid"
                    style={gridStyle}
                >
                    {headers.map((header, idx) => (
                        <Text key={`header-${idx}`} variant="caption" className="text-secondary text-center">
                            {header}
                        </Text>
                    ))}
                </div>

                {rows.map((row, rowIdx) => (
                    <div
                        key={`row-${rowIdx}`}
                        className="items-center gap-4 rounded bg-primary-contrast p-1 grid"
                        style={gridStyle}
                    >
                        {row.map((cell, cellIdx) => (
                            <div
                                key={`cell-${rowIdx}-${cellIdx}`}
                                className="flex w-full items-center justify-center gap-2 py-1"
                            >
                                {cell}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </Card>
    );
}; 