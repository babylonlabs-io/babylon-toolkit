import type { CSSProperties, PropsWithChildren } from "react";
import { twJoin } from "tailwind-merge";
import { AvatarImage } from "./AvatarImage";
import "./Avatar.css";

export interface AvatarProps extends PropsWithChildren {
  alt?: string;
  url?: string;
  /** Shown when `url` fails to load. */
  fallbackUrl?: string;
  className?: string;
  style?: CSSProperties;
  size?: "tiny" | "small" | "medium" | "large" | "xlarge";
  variant?: "circular" | "rounded" | "square";
}

export function Avatar({
  className,
  style,
  size = "large",
  variant = "circular",
  alt,
  url,
  fallbackUrl,
  children,
}: AvatarProps) {
  return (
    <div style={style} className={twJoin("bbn-avatar", `bbn-avatar-${size}`, `bbn-avatar-${variant}`, className)}>
      <AvatarImage key={`${url}|${fallbackUrl}`} alt={alt} url={url} fallbackUrl={fallbackUrl}>
        {children}
      </AvatarImage>
    </div>
  );
}
