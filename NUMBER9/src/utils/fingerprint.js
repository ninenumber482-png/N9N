/**
 * Lightweight device fingerprint generator.
 * Combines canvas, audio, and navigator signals into a stable hash.
 * No external dependencies.
 */

function canvasHash() {
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    c.width = 200;
    c.height = 50;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('NUMBER9', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('fingerprint', 4, 17);
    return c.toDataURL().slice(-100);
  } catch {
    return '';
  }
}

function audioHash() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return '';
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    gain.gain.value = 0;
    osc.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    // Just the context state + sample rate is enough for differentiation
    const hash = `${ctx.sampleRate}-${ctx.state}-${analyser.fftSize}`;
    osc.stop();
    ctx.close();
    return hash;
  } catch {
    return '';
  }
}

function navigatorHash() {
  const nav = navigator || {};
  return [
    nav.language,
    nav.platform,
    nav.hardwareConcurrency,
    nav.maxTouchPoints,
    nav.deviceMemory,
    screen?.width,
    screen?.height,
    screen?.colorDepth,
    window?.devicePixelRatio,
    new Date().getTimezoneOffset(),
  ].join('|');
}

async function sha256(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

let _cache = null;

/**
 * Returns a stable device fingerprint hash.
 * Cached after first call — safe to use repeatedly.
 */
export async function getFingerprint() {
  if (_cache) return _cache;
  const raw = [canvasHash(), audioHash(), navigatorHash()].join('::');
  _cache = await sha256(raw);
  return _cache;
}
