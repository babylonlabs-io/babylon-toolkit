import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const OpenIcon = ({
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
                d="M14 10.5714H10.5714V14H9.42857V10.5714H6V9.42857H9.42857V6H10.5714V9.42857H14V10.5714Z"
                fill="currentColor"
            />
        </svg>
    );
};
