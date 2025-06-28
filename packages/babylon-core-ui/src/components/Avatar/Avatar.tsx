import type { CSSProperties, PropsWithChildren } from "react";
import { twJoin } from "tailwind-merge";
import "./Avatar.css";

export interface AvatarProps extends PropsWithChildren {
  alt?: string;
  url?: string;
  className?: string;
  style?: CSSProperties;
  size?: "tiny" | "small" | "medium" | "large";
  variant?: "circular" | "rounded" | "square";
}

export function Avatar({ className, style, size = "large", variant = "circular", alt, url, children }: AvatarProps) {
  return (
    <div style={style} className={twJoin("bbn-avatar", `bbn-avatar-${size}`, `bbn-avatar-${variant}`, className)}>
      {url ? <img className="bbn-avatar-img" src={url} alt={alt} /> : children}
    </div>
  );
}
