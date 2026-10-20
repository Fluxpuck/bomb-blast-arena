// Types of powerups
export type PowerupType = "extraBomb" | "increaseRange" | "shield" | "teleport";

const INK = "#0d1626";

const PALETTE: Record<PowerupType, { accent: string; deep: string; pale: string }> = {
  extraBomb: { accent: "#38d6c4", deep: "#0f6a63", pale: "#c9fff8" },
  increaseRange: { accent: "#ff8a3d", deep: "#a8410c", pale: "#ffe0c2" },
  shield: { accent: "#5aa0ff", deep: "#1d4f9c", pale: "#d6e8ff" },
  teleport: { accent: "#c16bff", deep: "#6a2c9c", pale: "#f0d7ff" },
};

const OFF: Partial<CSSStyleDeclaration> = { display: "none" };

function box(styles: Partial<CSSStyleDeclaration>): Partial<CSSStyleDeclaration> {
  return Object.assign({ position: "absolute", boxSizing: "border-box" }, styles);
}

let keyframesInjected = false;
function ensureKeyframes(): void {
  if (keyframesInjected || typeof document === "undefined") return;
  keyframesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
@keyframes puHover{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes puPulse{0%,100%{opacity:.35;transform:scale(.92)}50%{opacity:.75;transform:scale(1.06)}}
@keyframes puSpark{0%,100%{opacity:.5;transform:scale(.8)}50%{opacity:1;transform:scale(1.25)}}
`;
  document.head.appendChild(style);
}

/**
 * Rescales a powerup visual built by createPowerUp to a new cell size,
 * without rebuilding its child structure. Used on viewport resize.
 */
export function rescalePowerUpVisual(mount: HTMLDivElement, cellSizePx: number): void {
  const scale = cellSizePx / 120;
  const scaler = mount.firstElementChild as HTMLDivElement | null;
  mount.style.width = `${120 * scale}px`;
  mount.style.height = `${120 * scale}px`;
  if (scaler) {
    scaler.style.transform = `scale(${scale})`;
  }
}

/**
 * Creates a power-up element, scaled from the source 120px design box down
 * to the live cell size.
 */
export function createPowerUp(type: PowerupType, cellSizePx: number): HTMLDivElement {
  ensureKeyframes();

  const scale = cellSizePx / 120;
  const { accent, deep, pale } = PALETTE[type];
  const bomb = type === "extraBomb";
  const shield = type === "shield";
  const teleport = type === "teleport";

  const mount = document.createElement("div");
  Object.assign(mount.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: `${120 * scale}px`,
    height: `${120 * scale}px`,
    zIndex: "5",
    pointerEvents: "auto",
  });
  // Visual marker so the renderer can find/rescale this element; the
  // gameplay state is CellState.powerup in game/state.ts.
  mount.dataset.powerup = type;

  const scaler = document.createElement("div");
  Object.assign(scaler.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "120px",
    height: "120px",
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  });
  mount.appendChild(scaler);

  const halo = document.createElement("div");
  Object.assign(
    halo.style,
    box({
      left: "6px",
      top: "6px",
      width: "108px",
      height: "108px",
      borderRadius: "28px",
      background: `radial-gradient(circle at 50% 50%, ${accent} 0%, rgba(0,0,0,0) 68%)`,
      animation: "puPulse 2s ease-in-out infinite",
    })
  );
  scaler.appendChild(halo);

  const stage = document.createElement("div");
  Object.assign(stage.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "120px",
    height: "120px",
    animation: "puHover 2.2s ease-in-out infinite",
  });
  scaler.appendChild(stage);

  const plate = document.createElement("div");
  Object.assign(
    plate.style,
    box({
      left: "14px",
      top: "14px",
      width: "92px",
      height: "92px",
      borderRadius: "24px",
      background: accent,
      border: `4px solid ${INK}`,
      boxShadow: "inset 0 -10px 0 rgba(0,0,0,.22)",
    })
  );
  stage.appendChild(plate);

  const plateTop = document.createElement("div");
  Object.assign(
    plateTop.style,
    box({
      left: "24px",
      top: "22px",
      width: "72px",
      height: "22px",
      borderRadius: "14px",
      background: "rgba(255,255,255,.26)",
    })
  );
  stage.appendChild(plateTop);

  const bombEl = document.createElement("div");
  Object.assign(
    bombEl.style,
    bomb
      ? box({
          left: "36px",
          top: "40px",
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: INK,
          boxShadow: "inset -6px -8px 0 rgba(255,255,255,.1)",
        })
      : OFF
  );
  stage.appendChild(bombEl);

  const bombShine = document.createElement("div");
  Object.assign(
    bombShine.style,
    bomb
      ? box({ left: "46px", top: "48px", width: "13px", height: "10px", borderRadius: "50%", background: pale, opacity: ".85" })
      : OFF
  );
  stage.appendChild(bombShine);

  const fuse = document.createElement("div");
  Object.assign(
    fuse.style,
    bomb
      ? box({ left: "66px", top: "28px", width: "6px", height: "18px", borderRadius: "3px", background: deep, transform: "rotate(22deg)" })
      : OFF
  );
  stage.appendChild(fuse);

  const spark = document.createElement("div");
  Object.assign(
    spark.style,
    bomb
      ? box({
          left: "70px",
          top: "20px",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: "#fff3c4",
          boxShadow: "0 0 14px #ffce3d",
          animation: "puSpark 1s ease-in-out infinite",
        })
      : OFF
  );
  stage.appendChild(spark);

  const barH = document.createElement("div");
  Object.assign(
    barH.style,
    bomb || shield || teleport
      ? OFF
      : box({ left: "24px", top: "52px", width: "72px", height: "16px", borderRadius: "8px", background: pale })
  );
  stage.appendChild(barH);

  const barV = document.createElement("div");
  Object.assign(
    barV.style,
    bomb || shield || teleport
      ? OFF
      : box({ left: "52px", top: "24px", width: "16px", height: "72px", borderRadius: "8px", background: pale })
  );
  stage.appendChild(barV);

  const shieldIcon = document.createElement("div");
  Object.assign(
    shieldIcon.style,
    shield
      ? box({
          left: "28px",
          top: "26px",
          width: "64px",
          height: "68px",
          background: pale,
          borderRadius: "14px 14px 50% 50%",
        })
      : OFF
  );
  stage.appendChild(shieldIcon);

  const shieldInner = document.createElement("div");
  Object.assign(
    shieldInner.style,
    shield
      ? box({
          left: "42px",
          top: "38px",
          width: "36px",
          height: "40px",
          background: deep,
          borderRadius: "8px 8px 50% 50%",
        })
      : OFF
  );
  stage.appendChild(shieldInner);

  const teleportIcon = document.createElement("div");
  Object.assign(
    teleportIcon.style,
    teleport
      ? box({
          left: "28px",
          top: "28px",
          width: "64px",
          height: "64px",
          border: `6px dashed ${pale}`,
          borderRadius: "50%",
          boxShadow: `0 0 0 5px ${deep}`,
          transform: "rotate(22deg)",
        })
      : OFF
  );
  stage.appendChild(teleportIcon);

  const teleportCore = document.createElement("div");
  Object.assign(
    teleportCore.style,
    teleport
      ? box({
          left: "48px",
          top: "48px",
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          background: INK,
          boxShadow: `0 0 0 5px ${pale}`,
        })
      : OFF
  );
  stage.appendChild(teleportCore);

  const tip = (x: number, y: number) =>
    box({
      left: `${x}px`,
      top: `${y}px`,
      width: "20px",
      height: "20px",
      background: pale,
      borderRadius: "4px",
      transform: "rotate(45deg)",
    });

  const tipPositions: Array<[number, number]> = [
    [16, 50],
    [84, 50],
    [50, 16],
    [50, 84],
  ];
  for (const [x, y] of tipPositions) {
    const tipEl = document.createElement("div");
    Object.assign(tipEl.style, bomb || shield || teleport ? OFF : tip(x, y));
    stage.appendChild(tipEl);
  }

  const core = document.createElement("div");
  Object.assign(
    core.style,
    bomb || shield || teleport
      ? OFF
      : box({ left: "48px", top: "48px", width: "24px", height: "24px", borderRadius: "50%", background: INK, boxShadow: "0 0 12px rgba(0,0,0,.4)" })
  );
  stage.appendChild(core);

  return mount;
}
