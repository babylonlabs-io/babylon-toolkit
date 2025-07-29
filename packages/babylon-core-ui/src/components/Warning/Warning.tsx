import { type PropsWithChildren } from "react";
import { twJoin } from "tailwind-merge";
import "./Warning.css";

export interface WarningProps extends PropsWithChildren {
    className?: string;
}

export function Warning({ children, className }: WarningProps) {
    return (
        <div className={twJoin("bbn-warning", className)}>
            <img src="/images/status/warning_dark2.svg" alt={"Warning icon"} className="bbn-warning-icon" />
            <p className="bbn-warning-message whitespace-pre-line">{children}</p>
        </div>
    );
}