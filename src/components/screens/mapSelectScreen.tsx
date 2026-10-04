import { GRID_PATTERN } from "../../game/core/config";
import { isInSpawnZone } from "../../game/grid";
import { MAP_PATTERNS, MapPattern } from "../../game/maps";
import { Button, Heading, Panel, Screen } from "../ui";

interface MapSelectScreenProps {
  onSelect: (mapId: string) => void;
  onBack: () => void;
}

const { gridRows, gridCols } = GRID_PATTERN;

const PREVIEW_CELL = {
  wall: "#5a6b82",
  pillar: "#7d8ea6",
  floor: "#0a1120",
  spawn: "#2a4d94",
};

/**
 * Renders a miniature preview of a map pattern: border walls, pillar cells,
 * spawn-safe corners, and open floor. Breakables are skipped — they are
 * random per game anyway. `cellSize` is the pixel size of one cell — the
 * lobby browser renders a smaller 3px version of the same preview.
 */
export function MapPreview({
  pattern,
  cellSize = 6,
}: {
  pattern: MapPattern;
  cellSize?: number;
}) {
  const cells: string[] = [];
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const isBorder =
        row === 0 || row === gridRows - 1 || col === 0 || col === gridCols - 1;
      if (isBorder) {
        cells.push(PREVIEW_CELL.wall);
      } else if (pattern.isPillar(row, col)) {
        cells.push(PREVIEW_CELL.pillar);
      } else if (isInSpawnZone(row, col)) {
        cells.push(PREVIEW_CELL.spawn);
      } else {
        cells.push(PREVIEW_CELL.floor);
      }
    }
  }

  return (
    <div
      className="grid gap-0 rounded-md overflow-hidden border-2 border-[#0b1526]"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, ${cellSize}px)`,
      }}
    >
      {cells.map((color, i) => (
        <div
          key={i}
          style={{ width: cellSize, height: cellSize, backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function MapSelectScreen({ onSelect, onBack }: MapSelectScreenProps) {
  return (
    <Screen>
      <Panel width={720}>
        <Heading title="SELECT MAP" subtitle="Breakable blocks are placed randomly each game" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {MAP_PATTERNS.map((pattern) => (
            <Button
              key={pattern.id}
              variant="card"
              className="gap-2"
              style={{ paddingBlock: 12 }}
              onClick={() => onSelect(pattern.id)}
            >
              <MapPreview pattern={pattern} />
              <span className="font-bold text-sm">{pattern.name}</span>
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Button
            variant="card"
            className="flex-row!"
            style={{ paddingBlock: 10 }}
            onClick={() => onSelect("random")}
          >
            <span className="text-lg font-bold text-ui-yellow">?</span>
            <span className="font-bold text-sm">Random Preset</span>
          </Button>

          <Button
            variant="card"
            className="flex-row!"
            style={{ paddingBlock: 10 }}
            onClick={() => onSelect("generate")}
          >
            <span className="text-lg font-bold text-ui-yellow">⚄</span>
            <span className="font-bold text-sm">Generate Random Map</span>
          </Button>
        </div>

        <div className="flex justify-center">
          <Button variant="neutral" onClick={onBack}>
            Back
          </Button>
        </div>
      </Panel>
    </Screen>
  );
}
