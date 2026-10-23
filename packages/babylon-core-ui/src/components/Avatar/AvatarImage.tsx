import { useState } from "react";

import type { AvatarProps } from "./Avatar";

type AvatarImageProps = Pick<AvatarProps, "alt" | "url" | "fallbackUrl" | "children">;

export function AvatarImage({ alt, url, fallbackUrl, children }: AvatarImageProps) {
  const [failedSrcs, setFailedSrcs] = useState<string[]>([]);
  const src =
    url && !failedSrcs.includes(url)
      ? url
      : fallbackUrl && !failedSrcs.includes(fallbackUrl)
        ? fallbackUrl
        : undefined;

  if (!src) return <>{children}</>;

  return (
    <img className="bbn-avatar-img" src={src} alt={alt} onError={() => setFailedSrcs((failed) => [...failed, src])} />
  );
}
