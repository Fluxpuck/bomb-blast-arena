import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

/**
 * Shared UI kit. Everything is Tailwind: tokens live in `src/app/globals.css` under `@theme`
 * (`ui-*` colors, font families, sprite keyframes) and every screen composes
 * the primitives and class constants below, so buttons, panels and type look
 * and behave the same everywhere.
 *
 * Class strings are written out in full (never built dynamically) so
 * Tailwind's scanner can see them.
 */

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Type */

export const LABEL =
  "font-mono text-[11px] font-bold tracking-[.14em] uppercase text-ui-muted";

const TITLE =
  "font-display font-normal text-[length:clamp(26px,5vw,34px)] leading-[.95] tracking-[.01em] text-center";

const TITLE_TONE = {
  yellow:
    "text-ui-yellow [text-shadow:0_3px_0_#a8410c,0_0_22px_rgba(255,154,43,.4)]",
  red: "text-[#ff7b7b] [text-shadow:0_3px_0_#8e1f1f,0_0_22px_rgba(239,68,68,.45)]",
  green:
    "text-[#6ff0a0] [text-shadow:0_3px_0_#14663a,0_0_22px_rgba(74,222,128,.4)]",
  cyan: "text-ui-cyan [text-shadow:0_3px_0_#0f5f73,0_0_22px_rgba(95,215,242,.4)]",
} as const;

export function Label({
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx(LABEL, className)} {...rest} />;
}

/** Screen heading: display-font title with an optional muted subtitle. */
export function Heading({
  title,
  subtitle,
  tone = "yellow",
}: {
  title: string;
  subtitle?: string;
  tone?: keyof typeof TITLE_TONE;
}) {
  return (
    <div className="mb-6">
      {/* fontFamily is also set inline (not just via the font-display class)
          so a page-injected stylesheet redefining a same-named utility class
          (seen from a browser extension's own `.font-display` reset) can't
          silently knock the heading back to the default sans fallback. */}
      <h1
        className={cx(TITLE, TITLE_TONE[tone])}
        style={{ fontFamily: "var(--font-bungee), Bungee, sans-serif" }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2.5 text-center text-sm text-ui-muted">{subtitle}</p>
      )}
    </div>
  );
}

export function Hint({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cx("text-xs text-ui-muted text-center", className)}>{children}</p>;
}

export function ErrorText({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p
      className={cx(
        "text-[13px] text-center text-ui-danger bg-[rgba(239,68,68,.12)] border border-[rgba(239,68,68,.35)] rounded-[10px] px-3 py-2",
        className
      )}
    >
      {children}
    </p>
  );
}

/* --------------------------------------------------------------- Surfaces */

/** Translucent HUD surface. Add radius + padding at the call site. */
export const PANEL_GLASS =
  "bg-[rgba(10,17,32,.78)] backdrop-blur-[6px] border-2 border-ui-line shadow-[0_8px_22px_rgba(0,0,0,.4),inset_0_1px_0_rgba(255,255,255,.06)]";

// Menu panels shrink to fit small viewports (Discord Activity tiles, narrow
// windows) down to this factor — below it the screen scrolls instead.
const MIN_PANEL_SCALE = 0.6;
// Matches the p-4 scrim padding; excluded from the space the panel may fill.
const SCREEN_PADDING = 16;

/** Full-screen scrim hosting a centered panel; scales the panel down to fit
 *  small viewports and scrolls below the minimum scale. */
export function Screen({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const el = contentRef.current;
      if (!el) return;
      const fitW = (window.innerWidth - SCREEN_PADDING * 2) / el.offsetWidth;
      const fitH = (window.innerHeight - SCREEN_PADDING * 2) / el.offsetHeight;
      setScale(Math.min(1, Math.max(MIN_PANEL_SCALE, Math.min(fitW, fitH))));
    };
    update();
    window.addEventListener("resize", update);
    // The panel can grow after mount (lobby roster, error text) — re-fit.
    const observer = new ResizeObserver(update);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => {
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-[3px] bg-[radial-gradient(70%_55%_at_50%_30%,rgba(11,21,38,.55)_0%,rgba(7,13,24,.9)_100%)]">
      <div
        ref={contentRef}
        className="m-auto"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

/** Raised dialog panel. `width` is the max width in px. */
export function Panel({
  children,
  width = 440,
  className,
}: {
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "m-auto w-full p-7 text-ui-text rounded-[18px] border-2 border-ui-line bg-linear-to-b from-ui-panel-top to-ui-panel-bottom shadow-[0_24px_60px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.07)]",
        className
      )}
      style={{ maxWidth: width } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** Titled group of rows (stats, players). */
export function Section({
  title,
  dotColor,
  children,
  className,
}: {
  title: string;
  dotColor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("p-3.5 rounded-xl bg-white/[.04] border border-[rgba(124,196,255,.14)]", className)}>
      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-[rgba(124,196,255,.16)]">
        {dotColor && <Dot color={dotColor} />}
        <Label>{title}</Label>
      </div>
      {children}
    </div>
  );
}

/** Label on the left, value (mono, bright) on the right. */
export const ROW =
  "flex justify-between gap-3 text-sm text-ui-muted [&>:last-child]:font-mono [&>:last-child]:font-bold [&>:last-child]:text-ui-text";

export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={cx(ROW, "py-[3px]")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cx("w-3 h-3 rounded-full shrink-0 shadow-[0_0_0_2px_rgba(0,0,0,.35)]", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2 rounded overflow-hidden bg-[rgba(124,196,255,.18)]">
      <div
        className="h-full rounded transition-[width,background-color] duration-1000 ease-linear"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- Forms */

export const INPUT_BASE =
  "font-[inherit] text-ui-text bg-ui-ink border-2 border-ui-line rounded-[10px] transition-[border-color,box-shadow] duration-[120ms] placeholder:text-[rgba(143,166,201,.55)] focus:outline-hidden focus:border-ui-cyan focus:shadow-[0_0_0_3px_rgba(95,215,242,.25)]";

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input type="text" className={cx(INPUT_BASE, "w-full px-3.5 py-2.5 text-base", className)} {...rest} />
  );
}

export function Checkbox({
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      type="checkbox"
      className={cx("w-[18px] h-[18px] accent-ui-yellow cursor-pointer", className)}
      {...rest}
    />
  );
}

export function Range({
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      type="range"
      className={cx(
        "appearance-none h-1.5 rounded-[3px] bg-[rgba(124,196,255,.25)] cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4",
        "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ui-yellow [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ui-orange-deep",
        "[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ui-yellow [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ui-orange-deep",
        className
      )}
      {...rest}
    />
  );
}

/* --------------------------------------------------------------- Buttons */

export type ButtonVariant =
  | "green"
  | "blue"
  | "orange"
  | "red"
  | "purple"
  | "discord"
  | "neutral"
  | "card";

const PIXEL = "font-pixel tracking-[.05em]";

// Each variant sets its own colour tokens; the Button base reads them.
const VARIANT: Record<ButtonVariant, string> = {
  green: `${PIXEL} [--btn-bg:#4ade80] [--btn-border:#166534] [--btn-fg:#0a0a0a] [--btn-glow:#4ade80]`,
  blue: `${PIXEL} [--btn-bg:#60a5fa] [--btn-border:#1e3a8a] [--btn-fg:#fff] [--btn-glow:#60a5fa]`,
  orange: `${PIXEL} [--btn-bg:#f59e0b] [--btn-border:#b45309] [--btn-fg:#fff] [--btn-glow:#f59e0b]`,
  red: `${PIXEL} [--btn-bg:#ef4444] [--btn-border:#991b1b] [--btn-fg:#fff] [--btn-glow:#ef4444]`,
  purple: `${PIXEL} [--btn-bg:#a78bfa] [--btn-border:#5b21b6] [--btn-fg:#fff] [--btn-glow:#a78bfa]`,
  discord: `${PIXEL} [--btn-bg:#5865f2] [--btn-border:#3a44b0] [--btn-fg:#fff] [--btn-glow:#5865f2]`,
  neutral: `${PIXEL} [--btn-bg:#5d6f8f] [--btn-border:#2b3648] [--btn-fg:#fff] [--btn-glow:#8fa6c9]`,
  // Card: a stacked, sans-serif tile (map picker). Brings its own metrics.
  card: "font-sans flex-col [--btn-bg:#18274a] [--btn-border:#0b1526] [--btn-fg:#e8f0fb] [--btn-glow:#5fd7f2] [--bw:3px] [--depth:4px] [--btn-py:10px] [--btn-fs:14px]",
};

// Size = the metrics the base reads. All four are set together so a size can
// be swapped (or overridden inline, as the start screen does) without clashes.
const SIZE = {
  sm: "[--bw:2px] [--depth:4px] [--btn-py:6px] [--btn-fs:14px] rounded-lg",
  md: "[--bw:3px] [--depth:5px] [--btn-py:10px] [--btn-fs:17px] rounded-[10px]",
  lg: "[--bw:3px] [--depth:6px] [--btn-py:13px] [--btn-fs:20px] rounded-[10px]",
} as const;

/*
 * Chunky arcade key. Raised via a thicker bottom border (so the hover ring, an
 * outline, wraps the whole button). Hover/focus: lift + brighten + white ring
 * + glow + side pointers. Active: pressed. Disabled: greyed, inert.
 * Hover and focus-visible rules are intentionally spelled out twice.
 */
const BUTTON_BASE = [
  // layout + type
  "relative inline-flex items-center justify-center gap-2 px-[18px] py-[var(--btn-py)] text-center font-bold select-none cursor-pointer [--lift:0px]",
  "text-[length:var(--btn-fs)] text-[color:var(--btn-fg)] bg-[color:var(--btn-bg)]",
  // raised edge
  "border-solid border-[length:var(--bw)] border-[color:var(--btn-border)] border-b-[length:calc(var(--bw)_+_var(--depth))]",
  "translate-y-[var(--lift)] outline-4 outline-transparent outline-offset-0",
  "shadow-[0_calc(var(--depth)_+_4px)_14px_rgba(0,0,0,.45),inset_0_3px_0_rgba(255,255,255,.28)]",
  "transition-[transform,box-shadow,filter,outline-color] duration-[120ms] ease-out",
  // hover
  "hover:[--lift:-4px] hover:brightness-[1.12] hover:saturate-[1.1] hover:outline-white hover:shadow-[0_calc(var(--depth)_+_12px)_22px_rgba(0,0,0,.5),0_0_34px_6px_var(--btn-glow),inset_0_3px_0_rgba(255,255,255,.4)]",
  // keyboard focus (same look as hover)
  "focus-visible:[--lift:-4px] focus-visible:brightness-[1.12] focus-visible:saturate-[1.1] focus-visible:outline-white focus-visible:shadow-[0_calc(var(--depth)_+_12px)_22px_rgba(0,0,0,.5),0_0_34px_6px_var(--btn-glow),inset_0_3px_0_rgba(255,255,255,.4)]",
  // pressed
  "active:[--lift:calc(var(--depth)_-_2px)] active:brightness-95 active:outline-white active:shadow-[inset_0_3px_0_rgba(0,0,0,.15)] active:duration-[40ms]",
  // disabled
  "disabled:[--lift:0px] disabled:cursor-not-allowed disabled:grayscale-[.7] disabled:brightness-[.8] disabled:opacity-60 disabled:outline-transparent disabled:shadow-[inset_0_3px_0_rgba(255,255,255,.15)]",
].join(" ");

// Side pointers that slide in on hover/focus (drawn with ::before / ::after).
const POINTERS = [
  "before:content-[''] before:absolute before:left-[6%] before:top-[calc(50%_-_var(--depth)/2)] before:w-0 before:h-0 before:border-solid before:border-transparent before:border-y-[.32em] before:border-r-0 before:border-l-[.5em] before:border-l-current before:opacity-0 before:-translate-x-2 before:-translate-y-1/2 before:transition-[opacity,transform] before:duration-[120ms] before:ease-out",
  "after:content-[''] after:absolute after:right-[6%] after:top-[calc(50%_-_var(--depth)/2)] after:w-0 after:h-0 after:border-solid after:border-transparent after:border-y-[.32em] after:border-r-0 after:border-l-[.5em] after:border-l-current after:opacity-0 after:translate-x-2 after:-translate-y-1/2 after:scale-x-[-1] after:transition-[opacity,transform] after:duration-[120ms] after:ease-out",
  "hover:before:opacity-100 hover:before:translate-x-0 hover:after:opacity-100 hover:after:translate-x-0",
  "focus-visible:before:opacity-100 focus-visible:before:translate-x-0 focus-visible:after:opacity-100 focus-visible:after:translate-x-0",
  "disabled:before:hidden disabled:after:hidden",
].join(" ");

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Ignored for the `card` variant. */
  size?: keyof typeof SIZE;
  /** Stretch to the full width of the parent. */
  block?: boolean;
}

export function Button({
  variant = "neutral",
  size = "md",
  block,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const isCard = variant === "card";
  return (
    <button
      type={type}
      className={cx(
        BUTTON_BASE,
        VARIANT[variant],
        isCard ? "rounded-[10px]" : SIZE[size],
        // Pointers would crowd small buttons and card content.
        !isCard && size !== "sm" && POINTERS,
        block && "w-full",
        className
      )}
      {...rest}
    />
  );
}

/** Quiet text-style action, e.g. "Back to menu". */
export function LinkButton({
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cx(
        "text-sm text-ui-muted rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors duration-[120ms] hover:text-white hover:bg-[rgba(124,196,255,.14)] focus-visible:text-white focus-visible:bg-[rgba(124,196,255,.14)] focus-visible:outline-hidden",
        className
      )}
      {...rest}
    />
  );
}

/** Touch d-pad key. */
export const PAD =
  "flex items-center justify-center w-16 h-16 text-xl font-bold text-ui-text bg-[rgba(10,17,32,.72)] border-2 border-[rgba(124,196,255,.32)] rounded-xl backdrop-blur-xs transition-[transform,background-color] duration-[60ms] select-none touch-none active:scale-[.93] active:bg-ui-yellow active:text-ui-ink active:border-ui-orange-deep";
