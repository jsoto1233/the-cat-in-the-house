// Lightweight procedural sound effects via the Web Audio API — no audio files
// needed. Currently used for the "caught by the cat" sting: an angry cat
// screech followed by the victim's "oof". Swap these for recorded samples later
// by loading an <audio>/AudioBuffer and playing it here instead.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// ---------------------------------------------------------------------------
// Every effect is routed through a master gain that mirrors the SAME volume /
// mute settings as the background music (persisted under "cith.music"), so the
// speaker control in the corner governs sound effects too. Previously effects
// went straight to the destination and ignored mute entirely.
// ---------------------------------------------------------------------------
const MUSIC_KEY = "cith.music";
let sfxVolume = 0.5;
let sfxMuted = false;

function loadStoredLevel() {
  try {
    const raw = localStorage.getItem(MUSIC_KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as { volume?: number; muted?: boolean };
    if (typeof p.volume === "number") sfxVolume = Math.min(1, Math.max(0, p.volume));
    sfxMuted = !!p.muted;
  } catch {
    /* ignore */
  }
}
if (typeof window !== "undefined") loadStoredLevel();

/** Current effective effect gain (0 when muted). */
function levelValue() {
  return sfxMuted ? 0 : sfxVolume;
}

/** Called by the music control whenever volume or mute changes. */
export function setSfxLevel(volume: number, muted: boolean) {
  sfxVolume = Math.min(1, Math.max(0, volume));
  sfxMuted = muted;
  if (master && ctx) {
    // Short ramp instead of a hard jump, so changes don't click.
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(levelValue(), ctx.currentTime, 0.02);
  }
}

/** True when effects should not be played at all. */
export function sfxSilent() {
  return sfxMuted || sfxVolume <= 0.001;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Autoplay policy can leave the context suspended until a user gesture; by
  // the time a catch happens the player has already interacted, so this resumes.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Master bus for all effects; created lazily on the shared context. */
function out(ac: AudioContext): GainNode {
  if (!master) {
    master = ac.createGain();
    master.gain.value = levelValue();
    master.connect(ac.destination);
  }
  return master;
}

/** An angry, wavering cat screech. */
function catScreech(ac: AudioContext, t0: number) {
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(720, t0);
  osc.frequency.linearRampToValueAtTime(950, t0 + 0.08);
  osc.frequency.linearRampToValueAtTime(420, t0 + 0.34);
  osc.frequency.linearRampToValueAtTime(300, t0 + 0.5);

  // Vibrato (the "yowl").
  const lfo = ac.createOscillator();
  lfo.frequency.value = 24;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 70;
  lfo.connect(lfoGain).connect(osc.frequency);

  // A little grit.
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1400;
  filter.Q.value = 2;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);

  osc.connect(filter).connect(gain).connect(out(ac));
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + 0.6);
  lfo.stop(t0 + 0.6);
}

/** A short human "oof" — a low grunt plus a breathy noise burst. */
function oof(ac: AudioContext, t0: number) {
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(190, t0);
  osc.frequency.exponentialRampToValueAtTime(85, t0 + 0.18);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
  osc.connect(gain).connect(out(ac));
  osc.start(t0);
  osc.stop(t0 + 0.3);

  // Breathy "..ff" noise.
  const len = Math.floor(ac.sampleRate * 0.14);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const nFilter = ac.createBiquadFilter();
  nFilter.type = "bandpass";
  nFilter.frequency.value = 1100;
  const nGain = ac.createGain();
  nGain.gain.setValueAtTime(0.14, t0 + 0.05);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  noise.connect(nFilter).connect(nGain).connect(out(ac));
  noise.start(t0 + 0.05);
  noise.stop(t0 + 0.22);
}

/** Play the full "caught by the cat" sting: angry meow, then an oof. */
export function playCatchSound() {
  if (sfxSilent()) return; // respect the global mute / volume control
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  catScreech(ac, t0);
  oof(ac, t0 + 0.2);
}

/** One claw rake: a short, bright noise burst that decays fast. */
function clawRake(ac: AudioContext, t0: number, gain = 0.16) {
  const len = Math.floor(ac.sampleRate * 0.13);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const fade = 1 - i / len;
    data[i] = (Math.random() * 2 - 1) * fade * fade;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.1;
  // Sweep downward so it sounds like a claw dragging across a surface.
  bp.frequency.setValueAtTime(5200, t0);
  bp.frequency.exponentialRampToValueAtTime(1500, t0 + 0.12);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
  src.connect(bp).connect(g).connect(out(ac));
  src.start(t0);
  src.stop(t0 + 0.14);
}

/** A cat hiss: airy high-band noise with a quick swell and fade. */
function catHiss(ac: AudioContext, t0: number) {
  const len = Math.floor(ac.sampleRate * 0.5);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2600;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(4200, t0);
  bp.frequency.linearRampToValueAtTime(5600, t0 + 0.18);
  bp.frequency.linearRampToValueAtTime(3200, t0 + 0.45);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.46);
  src.connect(hp).connect(bp).connect(g).connect(out(ac));
  src.start(t0);
  src.stop(t0 + 0.5);
}

/**
 * The menu ambience sting: three quick claw rakes plus a hiss, so the scratch
 * marks on the title screen read as the cat having just clawed the wall.
 */
export function playCatScratch() {
  if (sfxSilent()) return; // respect the global mute / volume control
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  clawRake(ac, t0, 0.17);
  clawRake(ac, t0 + 0.055, 0.15);
  clawRake(ac, t0 + 0.105, 0.13);
  catHiss(ac, t0 + 0.14);
}
