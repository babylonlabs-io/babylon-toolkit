/**
 * GodModePanel (dev / QA only — gated behind NEXT_PUBLIC_FF_GOD_MODE_PANEL).
 *
 * A draggable, floating "god mode" admin panel for exercising UI states
 * during development. It can also pop out into a separate browser window
 * (rendered via a React portal, so it stays in the same React tree and
 * shares state with the app — no cross-window plumbing).
 *
 * The shell only owns chrome: drag, pop-out, open/close, the tab rail, and
 * the pinned active-overrides summary chip. Every tab's actual controls live
 * in `./panels/*` and are wired in by `./registry.ts` — see `GodModeMount`.
 *
 * Every VISIBLE tab is mounted at once (hidden via the `hidden` attribute,
 * not conditional rendering) rather than only the active one. Before this
 * refactor every section rendered simultaneously inside one flat body, so
 * each dev-store→override-store publish effect ran whenever the panel was
 * open, regardless of which `<details>` a QA engineer had expanded. Mounting
 * only the active tab would replicate that bug at the tab level: switching
 * away from Position would tear down its publish effects (including the
 * cascade simulator's deliberate unmount-clear) mid-session. Mounting every
 * tab and hiding the rest keeps that exact "always mounted while the panel is
 * open" contract; tab switching is pure display.
 *
 * Chrome is intentionally theme-independent (fixed zinc colors) and inline,
 * not routed through copy.ts — none of it is shown to depositors.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PANEL_BUTTON_CLASS } from "./panelChrome";
import { CascadeOverridePublisher } from "./panels/CascadeSimulator";
import { SegmentButton } from "./panels/segmentButton";
import type { DevPanelTab } from "./registry";
import { SummaryChip } from "./SummaryChip";

interface GodModePanelProps {
  registry: DevPanelTab[];
}

function PanelHeader({
  visibleTabs,
  activeTabId,
  onSelectTab,
}: {
  visibleTabs: DevPanelTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <SummaryChip />
      <div className="flex flex-wrap gap-1.5">
        {visibleTabs.map((tab) => (
          <SegmentButton
            key={tab.id}
            label={tab.label}
            active={tab.id === activeTabId}
            onClick={() => onSelectTab(tab.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PanelBody({
  visibleTabs,
  activeTabId,
}: {
  visibleTabs: DevPanelTab[];
  activeTabId: string;
}) {
  return (
    <div className="space-y-4">
      {visibleTabs.map((tab) => (
        <div key={tab.id} hidden={tab.id !== activeTabId}>
          <tab.Component />
        </div>
      ))}
      <CascadeOverridePublisher />
    </div>
  );
}

export function GodModePanel({ registry }: GodModePanelProps) {
  const visibleTabs = registry.filter((tab) => !tab.gate || tab.gate());
  const [activeTabId, setActiveTabId] = useState(
    () => visibleTabs[0]?.id ?? "",
  );
  const activeTab = visibleTabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : (visibleTabs[0]?.id ?? "");

  // Defaults: collapsed (small launcher) anchored bottom-right. `pos` is null
  // until the user drags — then it switches to absolute top/left positioning.
  const [collapsed, setCollapsed] = useState(true);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [popupContainer, setPopupContainer] = useState<HTMLElement | null>(
    null,
  );
  const popupRef = useRef<Window | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Teardown for an in-progress drag's window listeners (see `startDrag`).
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const closePopup = useCallback(() => {
    const win = popupRef.current;
    popupRef.current = null;
    setPopupContainer(null);
    if (win) {
      win.removeEventListener("beforeunload", closePopup);
      win.close();
    }
  }, []);

  // Close the popup if the panel itself unmounts.
  useEffect(() => () => closePopup(), [closePopup]);

  // Tear down a still-active drag if the panel unmounts mid-drag (e.g.
  // navigation): `handleUp` would otherwise never fire to remove the window
  // listeners. Mirrors the popup cleanup above.
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // Opened from the click (a user gesture) — NOT an effect — so React
  // StrictMode's double-invoke can't open-then-close it.
  const openPopup = () => {
    const win = window.open("", "god-mode-panel", "width=460,height=820");
    if (!win) return;
    win.document.title = "God mode";
    win.document.body.style.margin = "0";
    win.document.body.style.background = "#18181b";
    // Copy the app's styles so Tailwind classes resolve in the popup.
    document
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((node) => win.document.head.appendChild(node.cloneNode(true)));
    const mount = win.document.createElement("div");
    win.document.body.appendChild(mount);
    popupRef.current = win;
    win.addEventListener("beforeunload", closePopup);
    setPopupContainer(mount);
  };

  // Drag via window-level listeners — robust, no pointer-capture quirks. The
  // origin is captured at press time, so the panel follows the cursor 1:1.
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    // The whole header is the drag zone, but its buttons keep their own click.
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    // First drag from the default (bottom-right) anchor: seed top/left from the
    // panel's current on-screen rect so it doesn't jump.
    const rect = panelRef.current?.getBoundingClientRect();
    const originLeft = pos?.left ?? rect?.left ?? 0;
    const originTop = pos?.top ?? rect?.top ?? 0;
    const handleMove = (ev: PointerEvent) => {
      setPos({
        left: Math.max(0, originLeft + ev.clientX - startX),
        top: Math.max(0, originTop + ev.clientY - startY),
      });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      dragCleanupRef.current = null;
    };
    // `handleUp` already removes both listeners, so it doubles as the unmount
    // teardown the effect above invokes.
    dragCleanupRef.current = handleUp;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const popup =
    popupContainer &&
    createPortal(
      <div className="min-h-screen bg-zinc-900 p-4 text-zinc-100">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">God mode — admin panel</span>
          <button
            type="button"
            onClick={closePopup}
            className={PANEL_BUTTON_CLASS}
          >
            Return ↙
          </button>
        </div>
        <div className="mb-3">
          <PanelHeader
            visibleTabs={visibleTabs}
            activeTabId={activeTab}
            onSelectTab={setActiveTabId}
          />
        </div>
        <PanelBody visibleTabs={visibleTabs} activeTabId={activeTab} />
      </div>,
      popupContainer,
    );

  function renderFloating() {
    if (collapsed) {
      return (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="fixed bottom-4 right-4 z-[9999] rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-lg"
        >
          God mode
        </button>
      );
    }

    return (
      // `resize: both` + `overflow: hidden` makes the box user-resizable from
      // the bottom-right corner. The header stays fixed; only the body scrolls,
      // so content never overflows the box. Anchored bottom-right by default;
      // switches to absolute top/left once dragged.
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          ...(pos
            ? { top: pos.top, left: pos.left }
            : { bottom: 16, right: 16 }),
          resize: "both",
          overflow: "hidden",
          minWidth: 320,
          minHeight: 200,
        }}
        className="z-[9999] flex max-h-[85vh] w-[420px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl"
      >
        <div
          onPointerDown={startDrag}
          className="flex shrink-0 cursor-move select-none items-center justify-between gap-2 border-b border-zinc-800 p-3"
        >
          <div className="flex-1 text-sm font-semibold">God mode</div>
          <button
            type="button"
            onClick={openPopup}
            className={PANEL_BUTTON_CLASS}
          >
            Pop out ↗
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className={PANEL_BUTTON_CLASS}
          >
            Hide
          </button>
        </div>

        <div className="shrink-0 border-b border-zinc-800 p-3">
          <PanelHeader
            visibleTabs={visibleTabs}
            activeTabId={activeTab}
            onSelectTab={setActiveTabId}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          <PanelBody visibleTabs={visibleTabs} activeTabId={activeTab} />
        </div>
      </div>
    );
  }

  // When popped out, god mode lives entirely in its own window — nothing is
  // rendered over the page. Closing that window (its "Return ↙" button or the
  // OS close) fires `beforeunload` → closePopup, restoring the floating panel.
  return (
    <>
      {popup}
      {!popupContainer && renderFloating()}
    </>
  );
}
