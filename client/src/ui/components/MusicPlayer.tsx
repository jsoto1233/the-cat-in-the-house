import { useEffect, useRef, useState } from "react";
import musicUrl from "../../assets/halloween-chaser.mp3";

const MUSIC_KEY = "cith.music";

interface MusicPrefs {
  volume: number; // 0..1
  muted: boolean;
}

function loadPrefs(): MusicPrefs {
  try {
    const raw = localStorage.getItem(MUSIC_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<MusicPrefs>;
      const volume =
        typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : 0.5;
      return { volume, muted: !!p.muted };
    }
  } catch {
    /* ignore */
  }
  return { volume: 0.5, muted: false };
}

/**
 * Global background music + a compact volume control docked bottom-right.
 * Hover (or focus) the speaker to reveal the volume slider; click it to mute.
 * Rendered once at the app root so the track keeps playing across screens.
 */
export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [prefs, setPrefs] = useState<MusicPrefs>(loadPrefs);
  const { volume, muted } = prefs;

  // Create the audio once. Browsers block autoplay-with-sound until the first
  // user gesture, so we also (re)try play on the first pointer/key interaction.
  useEffect(() => {
    const audio = new Audio(musicUrl);
    audio.loop = true;
    audio.preload = "auto";
    const stored = loadPrefs();
    audio.volume = stored.muted ? 0 : stored.volume;
    audioRef.current = audio;

    const tryPlay = () => {
      void audio.play().catch(() => {});
    };
    tryPlay();
    window.addEventListener("pointerdown", tryPlay);
    window.addEventListener("keydown", tryPlay);

    return () => {
      window.removeEventListener("pointerdown", tryPlay);
      window.removeEventListener("keydown", tryPlay);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Apply + persist volume/mute whenever they change.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = muted ? 0 : volume;
      if (audio.paused) void audio.play().catch(() => {});
    }
    try {
      localStorage.setItem(MUSIC_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs, muted, volume]);

  const level = muted ? 0 : volume;
  const pct = Math.round(volume * 100);

  return (
    <div className="music-ctl" role="group" aria-label="Background music">
      <div className="music-ctl__slider">
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPrefs({ volume: Number(e.target.value) / 100, muted: false })}
          aria-label="Music volume"
        />
      </div>
      <button
        type="button"
        className="music-ctl__btn"
        onClick={() => setPrefs((p) => ({ ...p, muted: !p.muted }))}
        aria-label={muted ? "Unmute music" : "Mute music"}
        aria-pressed={muted}
        title={muted ? "Unmute music" : "Mute music"}
      >
        <SpeakerIcon level={level} />
      </button>
    </div>
  );
}

function SpeakerIcon({ level }: { level: number }) {
  const muted = level === 0;
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9 h3.5 L13 4.5 v15 L7.5 15 H4 z" fill="currentColor" />
      {muted ? (
        <path
          d="M16.5 9.5 l5 5 M21.5 9.5 l-5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M16 9.2 a4 4 0 0 1 0 5.6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {level >= 0.5 && (
            <path
              d="M18.7 6.6 a8 8 0 0 1 0 10.8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </>
      )}
    </svg>
  );
}
