/**
 * Feedback sonoro leve via Web Audio API — cliques sintéticos, sem arquivos de
 * áudio. O `AudioContext` é criado preguiçosamente (no primeiro disparo, que
 * sempre ocorre dentro de um gesto do usuário, conforme a política dos
 * navegadores) e qualquer falha degrada silenciosamente.
 */

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
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
    return ctx;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Toca um "tick" curto. Parâmetros em Hz / segundos / ganho de pico (0–1). */
function tick(freq: number, duration: number, peak: number): void {
  const ac = getCtx();
  if (!ac) return;
  try {
    if (ac.state === 'suspended') void ac.resume();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    // Envelope rápido (ataque curto + decaimento exponencial) = clique seco.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    /* degrada silenciosamente */
  }
}

/** Clique ao soltar (drop) um componente no grid — grave e curto. */
export function playDrop(): void {
  tick(300, 0.05, 0.07);
}

/** Clique ao criar uma conexão válida — mais agudo e breve. */
export function playConnect(): void {
  tick(620, 0.045, 0.06);
}
