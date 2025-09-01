import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const CollapseIcon = ({
    className = "",
    size = 20,
    variant = "default",
    color
}: IconProps) => {
    const colorClass = color || iconColorVariants[variant];

    return (
        <svg
            style={{ width: size, height: size }}
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={twJoin("transition-opacity duration-200", colorClass, className)}
        >
            <rect
                x="0.5"
                y="0.5"
                width="19"
                height="19"
                rx="3.5"
                stroke="currentColor"
            />
            <path
                d="M14.0832 10.5846H5.9165V9.41797H14.0832V10.5846Z"
                fill="currentColor"
            />
        </svg>
    );
};
