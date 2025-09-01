import { type PropsWithChildren } from "react";
import { twJoin } from "tailwind-merge";
import { WarningIcon } from "../Icons";
import "./Warning.css";

export interface WarningProps extends PropsWithChildren {
    className?: string;
    iconClassName?: string;
    messageClassName?: string;
}

export function Warning({ children, className, iconClassName, messageClassName }: WarningProps) {
    return (
        <div className={twJoin("bbn-warning", className)}>
            <WarningIcon 
                variant="secondary" 
                size={22} 
                className={twJoin("bbn-warning-icon", iconClassName)} 
            />
            <p className={twJoin("bbn-warning-message", messageClassName)}>{children}</p>
        </div>
    );
}