import { GAME_CONFIG } from "../../game/core/config";
import { cx, Label, PANEL_GLASS, ProgressBar } from "../ui";

interface GameHUDProps {
  timeElapsedMs: number;
  gameTimeLimit?: number;
}

export function GameHUD({
  timeElapsedMs,
  gameTimeLimit = GAME_CONFIG.timeLimit,
}: GameHUDProps) {
  // Calculate time remaining in seconds
  const timeRemainingSeconds = Math.max(
    0,
    gameTimeLimit - Math.floor(timeElapsedMs / 1000)
  );

  // Format time as MM:SS
  const minutes = Math.floor(timeRemainingSeconds / 60);
  const seconds = timeRemainingSeconds % 60;
  const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  // Calculate progress percentage for the time bar
  const progressPercentage = Math.max(
    0,
    Math.min(100, (timeRemainingSeconds / gameTimeLimit) * 100)
  );

  // Determine color based on time remaining
  const getTimeColor = () => {
    if (progressPercentage > 60) return "#4ade80"; // Green
    if (progressPercentage > 30) return "#facc15"; // Yellow
    return "#ef4444"; // Red
  };
  const timeColor = getTimeColor();

  return (
    <div className={cx(PANEL_GLASS, "px-3 py-2 rounded-xl fixed top-[7.5rem] sm:top-4 short:top-1 left-1/2 transform -translate-x-1/2 portrait:top-auto portrait:bottom-2 portrait:left-2 portrait:-translate-x-0 z-50 min-w-[120px] sm:min-w-[160px] portrait:min-w-0 text-center")}>
      {/* Time Display (label and bar hidden in portrait — time only) */}
      <div className="mb-1 sm:mb-2 portrait:mb-0">
        <Label className="block text-[9px]! sm:text-[10px]! mb-0.5 portrait:hidden">
          Time remaining
        </Label>
        <div
          className="font-mono text-xl sm:text-2xl font-bold tabular-nums"
          style={{ color: timeColor }}
        >
          {formattedTime}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="portrait:hidden">
        <ProgressBar percent={progressPercentage} color={timeColor} />
      </div>
    </div>
  );
}
