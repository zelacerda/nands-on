/**
 * Feedback sonoro leve via Web Audio API — sons sintéticos, sem arquivos de
 * áudio. O `AudioContext` é criado preguiçosamente (no primeiro disparo, que
 * sempre ocorre dentro de um gesto do usuário, conforme a política dos
 * navegadores) e qualquer falha degrada silenciosamente.
 */

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let unavailable = false;

/** Obtém (ou cria) o AudioContext; `null` se indisponível. Nunca lança. */
function getCtx(): AudioContext | null {
  if (unavailable) return null;
  try {
    if (!ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) {
        unavailable = true;
        return null;
      }
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Buffer de ruído branco (~0,4 s), gerado uma vez e reutilizado. */
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    const len = Math.floor(ac.sampleRate * 0.4);
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

interface Env {
  /** atraso (s) a partir de agora */ when?: number;
  /** duração total até o silêncio (s) */ duration: number;
  /** ganho de pico (0–1) */ peak: number;
}

/** Aplica um envelope percussivo (ataque curto + decaimento exponencial). */
function envelope(ac: AudioContext, gain: GainNode, env: Env): { start: number; stop: number } {
  const start = ac.currentTime + (env.when ?? 0);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(env.peak, start + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + env.duration);
  return { start, stop: start + env.duration };
}

/** Burst de ruído filtrado (componente percussivo / "esteira"). */
function noiseHit(
  ac: AudioContext,
  opts: Env & { type: BiquadFilterType; freq: number; q?: number },
): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = opts.type;
  filter.frequency.value = opts.freq;
  if (opts.q !== undefined) filter.Q.value = opts.q;
  const gain = ac.createGain();
  const { start, stop } = envelope(ac, gain, opts);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(start);
  src.stop(stop);
}

/** Tom curto, com sweep opcional de frequência (corpo tonal / "click"). */
function toneHit(
  ac: AudioContext,
  opts: Env & { type: OscillatorType; freq: number; freqEnd?: number },
): void {
  const osc = ac.createOscillator();
  osc.type = opts.type;
  const gain = ac.createGain();
  const { start, stop } = envelope(ac, gain, opts);
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, stop);
  }
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(stop);
}

/**
 * Drop de componente — uma pancada surda (thud), tipo impacto grave: um seno
 * com sweep descendente, mais um corpo de ruído filtrado só nos graves para o
 * "baque" do impacto. Sem componentes agudos (nada de timbre metálico).
 */
export function playDrop(): void {
  const ac = getCtx();
  if (!ac) return;
  try {
    toneHit(ac, { type: 'sine', freq: 90, freqEnd: 30, duration: 0.1, peak: 0.18 });
    noiseHit(ac, { type: 'lowpass', freq: 120, q: 0.7, duration: 0.05, peak: 0.06 });
  } catch {
    /* degrada silenciosamente */
  }
}

/**
 * Conexão criada — clique de "encaixe", no espírito do Joy-Con do Nintendo
 * Switch: dois transientes secos e brilhantes em rápida sucessão (cli-clack),
 * sugerindo a peça travando no lugar.
 */
export function playConnect(): void {
  const ac = getCtx();
  if (!ac) return;
  try {
    // 1º clique: agudo e curtíssimo (aproximação da peça).
    toneHit(ac, { type: 'square', freq: 2600, freqEnd: 1400, duration: 0.022, peak: 0.05 });
    noiseHit(ac, { type: 'highpass', freq: 4500, duration: 0.018, peak: 0.05 });
    // 2º clique (~45 ms depois): um pouco mais grave = o "trava" do encaixe.
    toneHit(ac, { type: 'square', freq: 1700, freqEnd: 900, duration: 0.03, peak: 0.06, when: 0.045 });
    noiseHit(ac, { type: 'bandpass', freq: 3200, q: 1.5, duration: 0.025, peak: 0.05, when: 0.045 });
  } catch {
    /* degrada silenciosamente */
  }
}
