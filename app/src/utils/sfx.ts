// Tiny synthesized UI sounds (WebAudio, no assets).
// Honors the vik-sound setting ('0' = muted, default on).

function enabled(): boolean {
  try {
    return localStorage.getItem('vik-sound') !== '0';
  } catch {
    return true;
  }
}

function ctx(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const c = new AC();
    if (c.state === 'suspended') void c.resume().catch(() => {});
    return c;
  } catch {
    return null;
  }
}

// Soft paper flick for page turns.
export function playPageTurn() {
  if (!enabled()) return;
  try {
    const c = ctx();
    if (!c) return;
    const len = Math.floor(c.sampleRate * 0.15);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.3));
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, c.currentTime);
    filter.Q.setValueAtTime(1.5, c.currentTime);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.12, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    noise.start();
    noise.onended = () => void c.close().catch(() => {});
  } catch { /* silent */ }
}

// Short rune click for taps.
export function playRuneClick() {
  if (!enabled()) return;
  try {
    const c = ctx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.09);
    osc.onended = () => void c.close().catch(() => {});
  } catch { /* silent */ }
}
