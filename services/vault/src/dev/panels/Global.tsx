/**
 * "Global" god-mode tab (dev / QA only): app-wide dev knobs that aren't tied
 * to one page — the app theme, the protocol-wide status banner, the
 * vault-count-cap notification, and a read-only snapshot of every boolean
 * feature flag.
 *
 * Protocol status and "maximum vaults reached" are two of the three
 * notifications that are NOT derived from the liquidation-cascade
 * calculation (Figma v3 §7 soft-paused / §8 fully paused / §9 maximum vaults
 * reached) — driven by live chain reads (`useVaultCountCap` /
 * `useProtocolGateState`), so each gets a store override here that the
 * rendering component prefers over its live value. They live on this
 * always-visible tab, not the flag-gated Position tab, because they are
 * independent of the liquidation-notifications flag that gates that tab.
 */
import { useTheme } from "next-themes";
import { useEffect } from "react";

import type { ProtocolStatus } from "@/components/shared/protocolStatus";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";
import {
  setMaxVaultsOverride,
  setProtocolStatusOverride,
} from "@/overrides/protocolStatus";

import {
  DEBUG_FORCED_MAX_VAULTS,
  setDebugMaxVaultsOverride,
  setDebugProtocolStatusOverride,
  useDebugMaxVaultsOverride,
  useDebugProtocolStatusOverride,
} from "../debugPositionStore";
import { PANEL_SECTION_TITLE_CLASS, panelSegmentClass } from "../panelChrome";

import { SegmentButton } from "./segmentButton";

const THEME_OPTIONS = ["light", "dark", "system"] as const;

/** Dev theme switch — drives the app's next-themes provider so the dashboard
 *  behind the panel can be previewed in light / dark / system. */
function ThemeControls() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="space-y-2">
      <div className={PANEL_SECTION_TITLE_CLASS}>Theme</div>
      <div className="flex gap-2">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTheme(option)}
            className={`${panelSegmentClass(theme === option)} capitalize`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

const PROTOCOL_STATUS_LABELS: Record<ProtocolStatus, string> = {
  frozen: "Soft-paused",
  paused: "Fully paused",
};

function NotificationOverrideControls() {
  const maxVaultsOverride = useDebugMaxVaultsOverride();
  const protocolStatusOverride = useDebugProtocolStatusOverride();

  useEffect(() => {
    setMaxVaultsOverride(maxVaultsOverride);
  }, [maxVaultsOverride]);

  useEffect(() => {
    setProtocolStatusOverride(protocolStatusOverride);
  }, [protocolStatusOverride]);

  return (
    <div className="space-y-2">
      <div className={PANEL_SECTION_TITLE_CLASS}>Notifications</div>

      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
        <span>{COPY.liquidationWarnings.maxVaults.titleV3}</span>
        <input
          type="checkbox"
          checked={maxVaultsOverride !== null}
          onChange={(e) =>
            setDebugMaxVaultsOverride(
              e.target.checked ? DEBUG_FORCED_MAX_VAULTS : null,
            )
          }
        />
      </label>

      <div className="space-y-1">
        <div className="text-xs text-zinc-400">Protocol status</div>
        <div className="flex gap-2">
          <SegmentButton
            label="Live"
            active={protocolStatusOverride === null}
            onClick={() => setDebugProtocolStatusOverride(null)}
          />
          {(Object.keys(PROTOCOL_STATUS_LABELS) as ProtocolStatus[]).map(
            (status) => (
              <SegmentButton
                key={status}
                label={PROTOCOL_STATUS_LABELS[status]}
                active={protocolStatusOverride === status}
                onClick={() => setDebugProtocolStatusOverride(status)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** Read-only snapshot of every boolean feature flag — reflects the getters
 *  directly so a new flag needs no bookkeeping here to show up. */
function FeatureFlagList() {
  const flagStates = Object.entries(featureFlags).filter(
    (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
  );

  return (
    <div className="space-y-2">
      <div className={PANEL_SECTION_TITLE_CLASS}>Feature flags</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {flagStates.map(([name, value]) => (
          <div key={name} className="flex items-center justify-between gap-2">
            <span className="truncate text-zinc-400">{name}</span>
            <span className={value ? "text-orange-400" : "text-zinc-600"}>
              {value ? "on" : "off"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GlobalPanel() {
  return (
    <div className="space-y-4">
      <ThemeControls />
      <NotificationOverrideControls />
      <FeatureFlagList />
    </div>
  );
}
