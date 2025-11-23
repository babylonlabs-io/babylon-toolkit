import {
  DEFAULT_SOCIAL_LINKS,
  Footer,
  Header,
  StandardSettingsMenu,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Outlet } from "react-router";
import { twJoin } from "tailwind-merge";

import { Connect } from "../Wallet";
import { WaveBackground } from "../WaveBackground";
import {
  WaveBackgroundControls,
  DEFAULT_CONFIG,
  type WaveBackgroundConfig,
} from "../WaveBackground/WaveBackgroundControls";
import { useKonamiCode } from "../WaveBackground/useKonamiCode";
import { randomizeConfig } from "../WaveBackground/randomizeConfig";

export default function RootLayout() {
  const { theme, setTheme } = useTheme();
  const [showControls, setShowControls] = useState(false);
  const isKonamiActivated = useKonamiCode();
  const [whaleModeActive, setWhaleModeActive] = useState(false);
  const [currentValues, setCurrentValues] = useState<{
    speed: number;
    amplitude: number;
    frequency: number;
    waveAmplitude: number;
    waveValues?: Array<{
      startY?: number;
      endY?: number;
      startX?: number;
      endX?: number;
      strokeWidth?: number;
    }>;
  }>();
  const [config, setConfig] = useState<WaveBackgroundConfig>({ ...DEFAULT_CONFIG });

  const handleActivateWhaleMode = () => {
    setConfig((currentConfig) => randomizeConfig(currentConfig));
    setWhaleModeActive(true);
  };

  return (
    <div
      className={twJoin(
        "relative h-full min-h-svh w-full",
      )}
    >
      <WaveBackground
        className="fixed left-0 top-0 -z-10"
        width="100vw"
        height="100vh"
        waveCount={config.waveCount}
        colors={config.colors}
        fillColors={config.fillColors}
        strokeWidth={config.strokeWidth}
        strokeWidthStops={config.strokeWidthStops}
        speed={config.speed}
        amplitude={config.amplitude}
        frequency={config.frequency}
        waveAmplitude={config.waveAmplitude}
        showFill={config.showFill}
        floatSpeed={config.floatSpeed}
        waves={config.waves}
        backgroundColor={config.backgroundColor}
        waveOpacity={config.waveOpacity}
        paused={config.paused}
        onAnimatedValuesChange={setCurrentValues}
      />
      {isKonamiActivated && showControls && (
        <WaveBackgroundControls
          config={config}
          onChange={setConfig}
          onClose={() => setShowControls(false)}
          currentValues={currentValues}
        />
      )}
      {isKonamiActivated && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {whaleModeActive ? (
            <div className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
              🐋 Whale Mode Active
            </div>
          ) : (
            <button
              onClick={handleActivateWhaleMode}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-600 transition-colors"
            >
              🐋 Activate Whale Mode
            </button>
          )}
          {!showControls && (
            <button
              onClick={() => setShowControls(true)}
              className="rounded-lg bg-white px-4 py-2 shadow-lg dark:bg-gray-800"
            >
              Open Controls
            </button>
          )}
        </div>
      )}
      <div className="flex min-h-svh flex-col">
        <Header
          size="sm"
          rightActions={
            <div className="flex items-center gap-2">
              <Connect />
              <StandardSettingsMenu theme={theme} setTheme={setTheme} />
            </div>
          }
        />
        <Outlet />
        <div className="mt-auto">
          <Footer
            socialLinks={DEFAULT_SOCIAL_LINKS}
            copyrightYear={new Date().getFullYear()}
          />
        </div>
      </div>
    </div>
  );
}