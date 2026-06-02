/**
 * DisconnectedOverview Component
 *
 * Marketing / explainer panel rendered in place of the live Overview card
 * when no wallet is connected. Left column: product pitch, Connect CTA, and
 * the live borrow-rate APR stats. Right column: a step card summarizing the
 * borrowing flow.
 */

import { Fragment, type ReactNode } from "react";
import { PiClock } from "react-icons/pi";

import { useAaveVariableBorrowRates } from "@/applications/aave/hooks";
import { CARD_DARK_BG_CLASS } from "@/components/shared/layoutClasses";
import { Connect } from "@/components/Wallet";
import { COPY } from "@/copy";

const COPY_OVERVIEW = COPY.overview.disconnected;
const COPY_STEPS = COPY_OVERVIEW.steps;

interface AprStat {
  label: string;
  /** Uppercased token symbol used to look up the live borrow APR. */
  symbol: string;
  /** Tailwind class for the value's text color. */
  colorClass: string;
}

// Borrow-rate APR stats rendered at the bottom of the left column. Values are
// the live Aave variable borrow APR keyed by token symbol; a reserve with no
// available rate is filtered out so the row stays clean.
const APR_STATS: AprStat[] = [
  {
    label: COPY_OVERVIEW.aprLabels.usdt,
    symbol: "USDT",
    colorClass: "text-[#1ba27a]",
  },
  {
    label: COPY_OVERVIEW.aprLabels.usdc,
    symbol: "USDC",
    colorClass: "text-[#0b53bf]",
  },
  {
    label: COPY_OVERVIEW.aprLabels.wbtc,
    symbol: "WBTC",
    colorClass: "text-[#ce6533]",
  },
];

function PanelCard({ children }: { children: ReactNode }) {
  return (
    <div
      className={`flex flex-col rounded-2xl bg-secondary-highlight p-10 ${CARD_DARK_BG_CLASS}`}
    >
      {children}
    </div>
  );
}

function BabylonLogo() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 41 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-16 w-16 text-secondary-main dark:text-accent-primary"
    >
      <path
        d="M0.0915035 7.59655C-0.108345 7.05153 0.0251545 6.43939 0.433423 6.02854L5.99194 0.436178C6.40027 0.0253318 7.00888 -0.10897 7.55065 0.0920797L19.4025 4.47256C19.6937 4.58019 19.8872 4.85915 19.8872 5.1713V7.78191C19.8872 7.97936 19.8093 8.16869 19.6705 8.30826L16.7857 11.2105C16.5815 11.4159 16.2773 11.4831 16.0064 11.3825L9.32443 8.90267C9.02814 8.79268 8.73993 9.08262 8.84926 9.38063L11.3143 16.1032C11.4143 16.3757 11.3475 16.6819 11.1433 16.8873L8.57869 19.4668C8.28967 19.7575 8.28967 20.2289 8.57869 20.5196L11.1569 23.1134C11.3611 23.3188 11.4279 23.6249 11.3279 23.8974L8.86283 30.6195C8.75356 30.9175 9.04171 31.2074 9.338 31.0975L16.0199 28.6176C16.2908 28.5171 16.5951 28.5843 16.7993 28.7897L19.6705 31.6781C19.8092 31.8177 19.8872 32.0071 19.8872 32.2045V34.8159C19.8872 35.1277 19.6941 35.4064 19.4034 35.5143L7.56477 39.9079C7.023 40.109 6.41445 39.9747 6.00612 39.5639L0.44705 33.9714C0.0387203 33.5606 -0.0947793 32.9484 0.105069 32.4034L4.45771 20.5339C4.57968 20.2013 4.57968 19.8359 4.45771 19.5033L0.0915035 7.59655Z"
        className="fill-current"
      />
      <path
        d="M40.9085 32.4033C41.1083 32.9483 40.9748 33.5605 40.5666 33.9713L35.0081 39.5638C34.5997 39.9746 33.9912 40.1089 33.4494 39.9079L21.5975 35.5274C21.3063 35.4198 21.1128 35.1408 21.1128 34.8286V32.218C21.1128 32.0206 21.1907 31.8313 21.3295 31.6917L24.2143 28.7894C24.4185 28.5841 24.7227 28.5169 24.9936 28.6174L31.6756 31.0973C31.9719 31.2073 32.2601 30.9173 32.1507 30.6193L29.6856 23.8967C29.5857 23.6242 29.6525 23.3181 29.8567 23.1127L32.4213 20.5331C32.7103 20.2424 32.7103 19.7711 32.4213 19.4804L29.8431 16.8866C29.6389 16.6812 29.5721 16.375 29.6721 16.1025L32.1372 9.38048C32.2464 9.08241 31.9583 8.79253 31.662 8.90245L24.9801 11.3823C24.7092 11.4829 24.4049 11.4157 24.2007 11.2103L21.3295 8.32182C21.1908 8.18225 21.1128 7.99286 21.1128 7.79547V5.18405C21.1128 4.87227 21.3059 4.59356 21.5966 4.48568L33.4352 0.0920516C33.9769 -0.108998 34.5855 0.0253039 34.9938 0.436088L40.5529 6.02857C40.9612 6.43936 41.0947 7.05156 40.8949 7.59659L36.5422 19.466C36.4203 19.7986 36.4203 20.164 36.5422 20.4966L40.9085 32.4033Z"
        className="fill-current"
      />
    </svg>
  );
}

function AaveMark() {
  return (
    <svg
      viewBox="0 0 266 139"
      fill="currentColor"
      aria-hidden="true"
      className="w-6"
    >
      <path d="M97.5418 138.533C112.461 138.533 124.556 126.438 124.556 111.518C124.556 96.5987 112.461 84.5039 97.5418 84.5039C82.6221 84.5039 70.5273 96.5987 70.5273 111.518C70.5273 126.438 82.6221 138.533 97.5418 138.533Z" />
      <path d="M168.149 138.533C183.069 138.533 195.164 126.438 195.164 111.518C195.164 96.5987 183.069 84.5039 168.149 84.5039C153.23 84.5039 141.135 96.5987 141.135 111.518C141.135 126.438 153.23 138.533 168.149 138.533Z" />
      <path d="M132.8 0C59.4497 0 -0.0191954 60.6017 4.64786e-06 135.335H33.9264C33.9264 79.3281 77.8433 33.92 132.8 33.92C187.757 33.92 231.674 79.3281 231.674 135.335H265.6C265.613 60.6017 206.144 0 132.8 0Z" />
    </svg>
  );
}

function BitcoinMark() {
  return (
    <svg
      viewBox="0 0 19 25"
      fill="currentColor"
      aria-hidden="true"
      className="h-6 w-auto"
    >
      <path d="M18.9503 10.0505C19.3457 7.42356 17.3336 6.0114 14.5823 5.06934L15.4748 1.51087L13.2958 0.971054L12.4269 4.43575C11.854 4.29386 11.2657 4.15998 10.6811 4.02734L11.5561 0.539817L9.37835 0L8.48526 3.55724C8.0111 3.44989 7.54563 3.34378 7.09381 3.23212L7.09629 3.22101L4.0912 2.47514L3.51153 4.78864C3.51153 4.78864 5.12827 5.15695 5.09414 5.17977C5.97668 5.39879 6.13618 5.97932 6.10949 6.43955L5.0929 10.4934C5.15372 10.5088 5.23254 10.5311 5.31943 10.5656C5.24681 10.5477 5.16923 10.528 5.08917 10.5088L3.6642 16.1877C3.55621 16.4542 3.28252 16.854 2.66561 16.7022C2.68733 16.7337 1.08176 16.3093 1.08176 16.3093L0 18.7887L2.83566 19.4914C3.3632 19.6228 3.88018 19.7604 4.3891 19.8899L3.48732 23.4891L5.66388 24.0289L6.55697 20.468C7.15153 20.6284 7.72872 20.7765 8.29349 20.9159L7.4035 24.4602L9.58254 25L10.4843 21.4076C14.2 22.1066 16.9941 21.8246 18.1702 18.4839C19.1179 15.7941 18.123 14.2425 16.1681 13.2308C17.5918 12.9044 18.6642 11.9734 18.9503 10.0505ZM13.9716 16.9904C13.2983 19.6802 8.74221 18.2261 7.2651 17.8615L8.46168 13.0932C9.93878 13.4596 14.6754 14.1852 13.9716 16.9904ZM14.6456 10.0116C14.0312 12.4584 10.2392 11.2152 9.00908 10.9105L10.0939 6.58577C11.324 6.89053 15.2855 7.45934 14.6456 10.0116Z" />
    </svg>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F5F7F2] text-accent-primary dark:bg-[#202020]">
      {children}
    </div>
  );
}

function AprRow() {
  const { aprBySymbol } = useAaveVariableBorrowRates();
  const loadedStats = APR_STATS.map((stat) => ({
    ...stat,
    apr: aprBySymbol[stat.symbol],
  })).filter((stat): stat is AprStat & { apr: number } => stat.apr != null);
  if (loadedStats.length === 0) return null;
  return (
    <div className="flex flex-wrap items-stretch gap-4 sm:gap-6">
      {loadedStats.map((stat, i) => (
        <Fragment key={stat.symbol}>
          {i > 0 && (
            <div className="hidden w-px shrink-0 self-stretch bg-secondary-strokeLight dark:bg-secondary-strokeDark sm:block" />
          )}
          <div className="flex flex-col items-center justify-center whitespace-nowrap text-center">
            <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
              {stat.label}
            </span>
            <span
              className={`text-xl leading-[1.6] tracking-[0.15px] ${stat.colorClass}`}
            >
              {`${stat.apr.toFixed(1)}%`}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

interface StepCardProps {
  icon: ReactNode;
  title: string;
  caption: string;
}

function StepCard({ icon, title, caption }: StepCardProps) {
  return (
    <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
      <IconTile>{icon}</IconTile>
      <div className="flex flex-col gap-1">
        <h4 className="text-base font-medium text-accent-primary">{title}</h4>
        <p className="text-xs text-accent-secondary">{caption}</p>
      </div>
    </div>
  );
}

export function DisconnectedOverview() {
  return (
    <PanelCard>
      <div className="flex flex-col gap-10 md:flex-row md:items-start md:gap-12">
        {/* Left: product pitch, Connect CTA, and live APR stats */}
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex items-center gap-6">
            <BabylonLogo />
            <img
              src="/images/aave.svg"
              alt="Aave"
              className="h-16 w-16 rounded-full"
            />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[34px] font-normal leading-tight text-accent-primary">
              {COPY_OVERVIEW.heroTitle}
            </h3>
            <p className="text-base text-accent-secondary">
              {COPY_OVERVIEW.heroBody}
            </p>
          </div>

          <div>
            <Connect text={COPY_OVERVIEW.connectButton} />
          </div>

          <AprRow />
        </div>

        {/* Right: borrowing-flow step card */}
        <div className="flex flex-col rounded-2xl bg-white p-4 dark:bg-[#191919] md:w-[420px] md:shrink-0">
          <StepCard
            icon={<PiClock className="h-6 w-6" aria-hidden="true" />}
            title={COPY_STEPS.speed.title}
            caption={COPY_STEPS.speed.caption}
          />
          <div className="border-t-[0.5px] border-secondary-strokeLight dark:border-secondary-strokeDark" />
          <StepCard
            icon={<AaveMark />}
            title={COPY_STEPS.rates.title}
            caption={COPY_STEPS.rates.caption}
          />
          <div className="border-t-[0.5px] border-secondary-strokeLight dark:border-secondary-strokeDark" />
          <StepCard
            icon={<BitcoinMark />}
            title={COPY_STEPS.trustless.title}
            caption={COPY_STEPS.trustless.caption}
          />
          <div className="border-t-[0.5px] border-secondary-strokeLight dark:border-secondary-strokeDark" />
          <StepCard
            icon={
              <span aria-hidden="true" className="text-lg font-bold">
                {"</>"}
              </span>
            }
            title={COPY_STEPS.native.title}
            caption={COPY_STEPS.native.caption}
          />
        </div>
      </div>
    </PanelCard>
  );
}
