// Lightweight procedural sound effects via the Web Audio API — no audio files
// needed. Currently used for the "caught by the cat" sting: an angry cat
// screech followed by the victim's "oof". Swap these for recorded samples later
// by loading an <audio>/AudioBuffer and playing it here instead.

let ctx: AudioContext | null = null;

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

  osc.connect(filter).connect(gain).connect(ac.destination);
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
  osc.connect(gain).connect(ac.destination);
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
  noise.connect(nFilter).connect(nGain).connect(ac.destination);
  noise.start(t0 + 0.05);
  noise.stop(t0 + 0.22);
}

/** Play the full "caught by the cat" sting: angry meow, then an oof. */
export function playCatchSound() {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  catScreech(ac, t0);
  oof(ac, t0 + 0.2);
}
