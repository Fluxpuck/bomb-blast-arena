"use client";

import { useRef, useState } from "react";
import { Direction } from "../types/game";
import { Bomb } from "./sprites";
import { PAD } from "./ui";

interface TouchControlsProps {
  onMove: (direction: Direction) => void;
  onBomb: () => void;
}

// Repeat cadence while a direction button is held down.
const MOVE_REPEAT_MS = 160;

export const isTouchDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
};

const padButton = PAD;

/**
 * On-screen d-pad + bomb button for touch devices. Each tap queues one move
 * (same as a key press); holding a direction repeats it. Rendered only when
 * the device reports touch support.
 */
export function TouchControls({ onMove, onBomb }: TouchControlsProps) {
  const [touchCapable] = useState(isTouchDevice);
  const repeatRef = useRef<number | null>(null);

  if (!touchCapable) return null;

  const startMove = (direction: Direction) => {
    onMove(direction);
    stopMove();
    repeatRef.current = window.setInterval(
      () => onMove(direction),
      MOVE_REPEAT_MS
    );
  };

  const stopMove = () => {
    if (repeatRef.current !== null) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  };

  const dirButton = (direction: Direction, label: string) => (
    <button
      type="button"
      className={padButton}
      onPointerDown={(e) => {
        e.preventDefault();
        startMove(direction);
      }}
      onPointerUp={stopMove}
      onPointerLeave={stopMove}
      onPointerCancel={stopMove}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-x-0 bottom-24 short:bottom-2 z-50 pointer-events-none">
      <div className="flex justify-between items-center px-4">
        {/* D-pad */}
        <div className="grid grid-cols-3 gap-1 pointer-events-auto">
          <div />
          {dirButton(Direction.UP, "▲")}
          <div />
          {dirButton(Direction.LEFT, "◀")}
          <div />
          {dirButton(Direction.RIGHT, "▶")}
          <div />
          {dirButton(Direction.DOWN, "▼")}
          <div />
        </div>

        {/* Bomb button */}
        <button
          type="button"
          aria-label="Place bomb"
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center select-none touch-none pointer-events-auto border-[3px] border-[#a8410c] active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(160deg,#ffce3d 0%,#ff9a2b 100%)",
            boxShadow: "0 5px 0 #a8410c, 0 10px 18px rgba(0,0,0,.45), inset 0 3px 0 rgba(255,255,255,.35)",
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            onBomb();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="pointer-events-none -translate-y-0.5">
            <Bomb state="placed" scale={0.5} />
          </span>
        </button>
      </div>
    </div>
  );
}
