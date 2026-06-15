/**
 * DisconnectedOverview Component
 *
 * Marketing / explainer panel rendered in place of the live Overview card
 * when no wallet is connected. Left column: product pitch + Connect CTA +
 * APR stats. Right column: 3-step "how it works" explainer.
 */

import { Avatar, MobileLogo } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { CARD_DARK_BG_CLASS } from "@/components/shared/layoutClasses";
import { Connect } from "@/components/Wallet";
import { COPY } from "@/copy";

import { useLandingBorrowAprs } from "./useLandingBorrowAprs";

const COPY_OVERVIEW = COPY.overview.disconnected;

interface AprStat {
  label: string;
  /** Display value (e.g. "3.7%"). Stat is omitted entirely when undefined. */
  value: string | undefined;
  /** Tailwind class for the value's text color. */
  colorClass: string;
}

function PanelCard({ children }: { children: ReactNode }) {
  return (
    <div
      className={`flex flex-col rounded-2xl bg-secondary-highlight p-10 ${CARD_DARK_BG_CLASS}`}
    >
      {children}
    </div>
  );
}

function BtcBadgeIcon({ badge }: { badge: "down" | "lock" }) {
  // Light mode: white bg / #DDDDDD border / #666666 glyph.
  // Dark  mode: #111111 bg / #2F2F2F border / #B0B0B0 glyph.
  // `currentColor` lets the path inherit the text color set on the wrapper.
  return (
    <div className="relative inline-flex h-8 w-8">
      <img src="/images/btc.png" alt="BTC" className="h-8 w-8 rounded-full" />
      <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-[0.5px] border-[#DDDDDD] bg-white text-[#666666] dark:border-[#2F2F2F] dark:bg-[#111111] dark:text-[#B0B0B0]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {badge === "down" ? (
            <path
              d="M13 9L12.295 8.295L9.5 11.085V5H8.5V11.085L5.71 8.29L5 9L9 13L13 9Z"
              fill="currentColor"
            />
          ) : (
            <path
              d="M12 7H11.5V6C11.5 4.62 10.38 3.5 9 3.5C7.62 3.5 6.5 4.62 6.5 6V7H6C5.45 7 5 7.45 5 8V13C5 13.55 5.45 14 6 14H12C12.55 14 13 13.55 13 13V8C13 7.45 12.55 7 12 7ZM7.5 6C7.5 5.17 8.17 4.5 9 4.5C9.83 4.5 10.5 5.17 10.5 6V7H7.5V6ZM12 13H6V8H12V13ZM9 11.5C9.55 11.5 10 11.05 10 10.5C10 9.95 9.55 9.5 9 9.5C8.45 9.5 8 9.95 8 10.5C8 11.05 8.45 11.5 9 11.5Z"
              fill="currentColor"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

interface StepProps {
  index: number;
  icon: ReactNode;
  title: string;
  body: string;
}

function Step({ index, icon, title, body }: StepProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 text-center">
      {icon}
      <div>
        <span className="text-sm text-accent-secondary">
          {COPY_OVERVIEW.steps.stepLabel(index)}
        </span>
        <h4 className="text-lg font-medium text-accent-primary">{title}</h4>
        <p className="text-sm text-accent-secondary">{body}</p>
      </div>
    </div>
  );
}

export function DisconnectedOverview() {
  const borrowAprs = useLandingBorrowAprs();
  const aprStats: AprStat[] = [
    {
      label: COPY_OVERVIEW.aprLabels.usdt,
      value: borrowAprs.usdt,
      colorClass: "text-[#26A17B]",
    },
    {
      label: COPY_OVERVIEW.aprLabels.usdc,
      value: borrowAprs.usdc,
      colorClass: "text-[#2775CA]",
    },
    {
      label: COPY_OVERVIEW.aprLabels.wbtc,
      value: borrowAprs.wbtc,
      colorClass: "text-[#F7931A]",
    },
  ];

  return (
    <PanelCard>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-12">
        {/* Left: product pitch + Connect CTA + APR stats */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-4">
            <span className="[&_svg]:!h-16 [&_svg]:!w-16 [&_svg]:!text-secondary-main dark:[&_svg]:!text-accent-primary">
              <MobileLogo />
            </span>
            <img
              src="/images/aave.svg"
              alt="Aave"
              className="h-16 w-16 rounded-full"
            />
          </div>

          <h3 className="mt-10 text-[34px] font-normal leading-tight text-accent-primary">
            {COPY_OVERVIEW.heroTitle}
          </h3>
          <div className="mt-4 space-y-1 text-base text-accent-secondary">
            {COPY_OVERVIEW.heroBody.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          <div className="mt-8">
            <Connect text={COPY_OVERVIEW.connectButton} />
          </div>

          {(() => {
            const loadedStats = aprStats.filter(
              (s): s is AprStat & { value: string } => s.value !== undefined,
            );
            if (loadedStats.length === 0) return null;
            return (
              <div className="mt-10 grid grid-cols-3 gap-4">
                {loadedStats.map((stat, i) => (
                  <div
                    key={stat.label}
                    className={`flex flex-col gap-1 ${i > 0 ? "border-l border-secondary-strokeLight pl-4 dark:border-secondary-strokeDark" : ""}`}
                  >
                    <span className="text-xs text-accent-secondary">
                      {stat.label}
                    </span>
                    <span className={`text-3xl font-normal ${stat.colorClass}`}>
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Right: 3-step explainer (in the same panel) */}
        <div className="flex flex-col gap-6 rounded-2xl bg-surface/40 p-6 dark:bg-black/20">
          <Step
            index={1}
            icon={<BtcBadgeIcon badge="down" />}
            title={COPY_OVERVIEW.steps.one.title}
            body={COPY_OVERVIEW.steps.one.body}
          />
          <div className="border-t-[0.5px] border-secondary-strokeLight" />
          <Step
            index={2}
            icon={
              <div className="flex items-center">
                <Avatar
                  url="/images/usdt.svg"
                  alt="USDT"
                  size="medium"
                  className="h-8 w-8"
                />
                <Avatar
                  url="/images/usdc.svg"
                  alt="USDC"
                  size="medium"
                  className="-ml-2 h-8 w-8"
                />
                <Avatar
                  url="/images/wbtc.svg"
                  alt="WBTC"
                  size="medium"
                  className="-ml-2 h-8 w-8 bg-white"
                />
              </div>
            }
            title={COPY_OVERVIEW.steps.two.title}
            body={COPY_OVERVIEW.steps.two.body}
          />
          <div className="border-t-[0.5px] border-secondary-strokeLight" />
          <Step
            index={3}
            icon={<BtcBadgeIcon badge="lock" />}
            title={COPY_OVERVIEW.steps.three.title}
            body={COPY_OVERVIEW.steps.three.body}
          />
        </div>
      </div>
    </PanelCard>
  );
}
