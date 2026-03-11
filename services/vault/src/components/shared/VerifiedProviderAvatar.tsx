import { ProviderAvatar, type AvatarProps } from "@babylonlabs-io/core-ui";

interface VerifiedProviderAvatarProps {
  name: string;
  url?: string;
  size?: AvatarProps["size"];
  verified?: boolean;
}

export function VerifiedProviderAvatar({
  name,
  url,
  size = "medium",
  verified,
}: VerifiedProviderAvatarProps) {
  const avatar = <ProviderAvatar name={name} url={url} size={size} />;

  if (!verified) return avatar;

  return (
    <div className="relative inline-flex">
      {avatar}
      <span className="absolute bottom-0 right-[-1px] flex size-2 items-center justify-center overflow-hidden rounded-full border border-[#191919] bg-[white]">
        <svg viewBox="0 0 8 8" fill="none" className="size-[5px]">
          <path
            d="M1.5 4.5L3.5 6.5L7 2"
            stroke="#191919"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
