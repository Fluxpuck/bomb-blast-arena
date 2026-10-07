import { PlayerStats } from "../../game/hooks/tracker";
import { cx, Dot, Label, PANEL_GLASS, ROW } from "../ui";

type CornerPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface PlayerHUDProps {
  player: PlayerStats;
  corner: CornerPosition;
}

export function PlayerHUD({ player, corner }: PlayerHUDProps) {
  // Determine position classes based on corner (tighter on small screens).
  // In portrait orientation the parent grid lays these out statically, so
  // the offsets are inert there.
  const getPositionClasses = (): string => {
    switch (corner) {
      case "top-left":
        return "top-2 left-2 sm:top-4 sm:left-4";
      case "top-right":
        return "top-2 right-2 sm:top-4 sm:right-4";
      // Bottom HUDs lift above the touch controls on short screens — the
      // d-pad is ~160px tall there (48px pads at bottom-2).
      case "bottom-left":
        return "bottom-2 left-2 sm:bottom-4 sm:left-4 short:bottom-[168px]";
      case "bottom-right":
        return "bottom-2 right-2 sm:bottom-4 sm:right-4 short:bottom-[168px]";
    }
  };

  // Get player type label
  const playerTypeLabel = player.isPlayer ? "Player" : "Computer";
  const playerNumber = player.id.split("-")[1] || "";
  const displayName = player.name || `${playerTypeLabel} ${playerNumber}`;

  // Get player status
  const isAlive = player.isAlive;

  return (
    <div
      className={cx(
        PANEL_GLASS,
        "rounded-xl fixed portrait:static overflow-hidden z-40 w-32 sm:w-48 portrait:w-full",
        getPositionClasses()
      )}
      style={{
        borderColor: player.color,
        opacity: isAlive ? 1 : 0.75,
      }}
    >
      {/* Header bar with player color */}
      <div className="h-1.5" style={{ backgroundColor: player.color }} />

      {/* Player info */}
      <div className="p-2 sm:p-3 portrait:p-2">
        {/* Player name */}
        <div className="flex justify-between items-center sm:mb-2 portrait:mb-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Dot color={player.color} />
            <span className="font-bold text-sm truncate">{displayName}</span>
            {player.latencyMs !== null && (
              <Label className="text-[10px]! tracking-normal!">
                {player.latencyMs} ms
              </Label>
            )}
          </div>
        </div>

        {/* Player stats (hidden on small, portrait, and short screens to
            keep HUDs compact and clear of the touch controls) */}
        {isAlive ? (
          <div className="hidden sm:block portrait:hidden short:hidden">
            <div className={cx(ROW, "py-0.5")}>
              <span>Score</span>
              <span>{player.score}</span>
            </div>

            <div className={cx(ROW, "py-0.5")}>
              <span>Lives</span>
              <span className="flex gap-0.5 font-sans! text-[#ef4444]!">
                {[...Array(player.lives)].map((_, i) => (
                  <span key={i} aria-hidden>
                    ♥
                  </span>
                ))}
              </span>
            </div>

            <div className={cx(ROW, "py-0.5")}>
              <span>Bombs</span>
              <span>
                {player.bombsAvailable - (player.activeBombs || 0)}
                <span className="text-ui-muted!"> / {player.bombsAvailable}</span>
              </span>
            </div>

            <div className={cx(ROW, "py-0.5")}>
              <span>Range</span>
              <span>{player.bombRange}</span>
            </div>

            {player.kills > 0 && (
              <div className={cx(ROW, "py-0.5")}>
                <span>Kills</span>
                <span>{player.kills}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-1">
            <Label className="text-ui-danger! tracking-[0.2em]!">Eliminated</Label>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Component to display multiple player HUDs in the corners of the screen
 */
export function PlayersHUD({ players }: { players: PlayerStats[] }) {
  // Define corner positions based on player count
  const cornerPositions: CornerPosition[] = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ];

  // Landscape/desktop: `contents` keeps each HUD fixed in its corner.
  // Portrait: the wrapper becomes a 2-column grid pinned to the top.
  return (
    <div className="contents portrait:fixed portrait:inset-x-0 portrait:top-0 portrait:grid portrait:grid-cols-2 portrait:gap-1.5 portrait:p-2 portrait:z-40">
      {players.slice(0, 4).map((player, index) => (
        <PlayerHUD
          key={player.id}
          player={player}
          corner={cornerPositions[index]}
        />
      ))}
    </div>
  );
}
