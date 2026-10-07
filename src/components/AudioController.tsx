import { useEffect, useState } from "react";
import { useAudio } from "../hooks/useAudio";
import { isSoundMuted, setSoundMuted } from "../game/hooks/sound";
import { cx, Label, PANEL_GLASS, Range } from "./ui";

// Path to background music
const BACKGROUND_MUSIC = "/music/lo-fi.mp3";

interface AudioControllerProps {
  autoPlay?: boolean;
}

export function AudioController({ autoPlay = true }: AudioControllerProps) {
  const { volume, isMuted, toggleMute, setVolume } = useAudio({
    audioSrc: BACKGROUND_MUSIC,
    autoPlay,
    loop: true,
    defaultVolume: 0.5,
    defaultMuted: false,
  });

  // Sound-effects mute lives outside React (game/hooks/sound.ts); mirror the
  // useAudio pattern and read the persisted preference after mount only.
  const [sfxMuted, setSfxMuted] = useState(false);
  useEffect(() => {
    setSfxMuted(isSoundMuted());
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const handleToggleSfx = () => {
    const nextMuted = !sfxMuted;
    setSoundMuted(nextMuted);
    setSfxMuted(nextMuted);
  };

  return (
    <div className={cx(PANEL_GLASS, "px-4 py-2 rounded-full fixed top-2 sm:top-auto sm:bottom-4 left-1/2 transform -translate-x-1/2 portrait:top-auto portrait:bottom-2 portrait:left-auto portrait:right-2 portrait:-translate-x-0 short:top-auto short:bottom-2 short:left-auto short:right-24 short:-translate-x-0 flex items-center gap-3 z-50")}>
      <button
        type="button"
        onClick={handleToggleSfx}
        aria-label={sfxMuted ? "Unmute sound effects" : "Mute sound effects"}
        title="Sound effects"
        className="text-xl rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4"
      >
        {sfxMuted ? "🔕" : "💥"}  
      </button>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={isMuted ? "Unmute music" : "Mute music"}
        title="Music"
        className="text-xl rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4"
      >
        {isMuted ? "🔇" : "🔊"}
      </button>

      <Range
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={handleVolumeChange}
        aria-label="Music volume"
        className="hidden sm:block w-24"
      />

      <Label className="hidden sm:block tracking-normal! w-9 text-right">
        {Math.round(volume * 100)}%
      </Label>
    </div>
  );
}
