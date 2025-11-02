import { useEffect, useRef, useState } from "react";

interface GlassConfig {
  shadowOffset: number;
  shadowBlur: number;
  shadowSpread: number;
  shadowColor: string;
  tintColor: string;
  tintOpacity: number;
  frostBlur: number;
  noiseFrequency: number;
  distortionStrength: number;
}

const defaultConfig: GlassConfig = {
  shadowOffset: 0,
  shadowBlur: 20,
  shadowSpread: -5,
  shadowColor: "rgba(255, 255, 255, 0.7)",
  tintColor: "255, 255, 255",
  tintOpacity: 0.4,
  frostBlur: 2,
  noiseFrequency: 0.008,
  distortionStrength: 77,
};

export function DynamicBackground() {
  const glassRef = useRef<HTMLDivElement>(null);
  const svgFilterRef = useRef<SVGFilterElement>(null);
  const [config] = useState<GlassConfig>(defaultConfig);
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const root = document.documentElement;
    
    root.style.setProperty("--shadow-offset", `${config.shadowOffset}`);
    root.style.setProperty("--shadow-blur", `${config.shadowBlur}px`);
    root.style.setProperty("--shadow-spread", `${config.shadowSpread}px`);
    root.style.setProperty("--shadow-color", config.shadowColor);
    root.style.setProperty("--tint-color", config.tintColor);
    root.style.setProperty("--tint-opacity", `${config.tintOpacity}`);
    root.style.setProperty("--frost-blur", `${config.frostBlur}px`);

    if (svgFilterRef.current) {
      const turbulence = svgFilterRef.current.querySelector("feTurbulence");
      const displacementMap = svgFilterRef.current.querySelector("feDisplacementMap");
      
      if (turbulence) {
        turbulence.setAttribute(
          "baseFrequency",
          `${config.noiseFrequency} ${config.noiseFrequency}`
        );
      }
      
      if (displacementMap) {
        displacementMap.setAttribute("scale", `${config.distortionStrength}`);
      }
    }
  }, [config]);

  useEffect(() => {
    const glassEl = glassRef.current;
    if (!glassEl) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      
      const rect = glassEl.getBoundingClientRect();
      glassEl.style.position = "absolute";
      glassEl.style.top = `${rect.top}px`;
      glassEl.style.left = `${rect.left}px`;
      glassEl.style.transform = "none";

      startPosRef.current = { x: e.clientX, y: e.clientY };
      
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp, { once: true });
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      
      startPosRef.current = { x: e.clientX, y: e.clientY };
      
      const newX = glassEl.offsetLeft + dx;
      const newY = glassEl.offsetTop + dy;
      
      glassEl.style.left = `${newX}px`;
      glassEl.style.top = `${newY}px`;
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("pointermove", onPointerMove);
    };

    glassEl.addEventListener("pointerdown", onPointerDown);

    return () => {
      glassEl.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return (
    <>
      <style>{`
        :root {
          --shadow-offset: ${config.shadowOffset};
          --shadow-blur: ${config.shadowBlur}px;
          --shadow-spread: ${config.shadowSpread}px;
          --shadow-color: ${config.shadowColor};
          --tint-color: ${config.tintColor};
          --tint-opacity: ${config.tintOpacity};
          --frost-blur: ${config.frostBlur}px;
          --outer-shadow-blur: 24px;
        }

        .dynamic-bg-container {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }

        .dynamic-bg-glass {
          position: absolute;
          width: 300px;
          height: 200px;
          border-radius: 28px;
          cursor: move;
          isolation: isolate;
          touch-action: none;
          box-shadow: 0px 6px var(--outer-shadow-blur) rgba(0, 0, 0, 0.2);
          pointer-events: auto;
        }

        .dynamic-bg-glass::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: 28px;
          box-shadow: inset var(--shadow-offset) var(--shadow-offset) var(--shadow-blur) var(--shadow-spread) var(--shadow-color);
          background-color: rgba(var(--tint-color), var(--tint-opacity));
        }

        .dynamic-bg-glass::after {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          border-radius: 28px;
          backdrop-filter: blur(var(--frost-blur));
          filter: url(#glass-distortion);
          isolation: isolate;
          -webkit-backdrop-filter: blur(var(--frost-blur));
          -webkit-filter: url("#glass-distortion");
        }

        @media (max-width: 600px) {
          .dynamic-bg-glass {
            width: 250px;
            height: 120px;
          }
        }
      `}</style>

      <div className="dynamic-bg-container">
        <div
          ref={glassRef}
          className="dynamic-bg-glass"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="0"
        height="0"
        style={{ position: "absolute", overflow: "hidden" }}
      >
        <defs>
          <filter
            ref={svgFilterRef}
            id="glass-distortion"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${config.noiseFrequency} ${config.noiseFrequency}`}
              numOctaves={2}
              seed={92}
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="blurred"
              scale={config.distortionStrength}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
    </>
  );
}
