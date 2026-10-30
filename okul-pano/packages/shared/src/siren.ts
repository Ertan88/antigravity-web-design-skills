/**
 * Kırmızı alarm: dalgalı (wail) siren. Ses tonu iki ucu arasında yavaşça yükselip alçalır ve hiç
 * susmaz; uyarı bitirilince durur. İki osilatör (temel + oktav) ve hafif bozulma gerçek bir sirenin
 * dolgun sesini verir. Tarayıcı ilk dokunuşa kadar sesi engellerse ilk dokunuşta başlar; kiosk
 * kurulumundaki --autoplay-policy bayrağıyla doğrudan çalar.
 */
export function startWailSiren(ctx: AudioContext, volume = 0.3): () => void {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.4);
  // Hafif doyum: sesi kulak tırmalamadan dolgunlaştırır
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    curve[i] = Math.tanh(2.2 * x);
  }
  shaper.curve = curve;
  shaper.connect(out);
  out.connect(ctx.destination);

  const base = ctx.createOscillator();
  base.type = 'sawtooth';
  const octave = ctx.createOscillator();
  octave.type = 'square';
  const octaveGain = ctx.createGain();
  octaveGain.gain.value = 0.25;
  base.connect(shaper);
  octave.connect(octaveGain).connect(shaper);

  // Dalga: 4,5 saniyede bir 450 Hz ↔ 1150 Hz arasında yükselip alçalır
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 1 / 4.5;
  const depth = ctx.createGain();
  depth.gain.value = 350;
  lfo.connect(depth);
  base.frequency.value = 800;
  octave.frequency.value = 1600;
  depth.connect(base.frequency);
  const depth2 = ctx.createGain();
  depth2.gain.value = 700;
  lfo.connect(depth2).connect(octave.frequency);

  const t = ctx.currentTime;
  for (const o of [base, octave, lfo]) o.start(t);
  return () => {
    const end = ctx.currentTime;
    out.gain.cancelScheduledValues(end);
    out.gain.setValueAtTime(out.gain.value, end);
    out.gain.linearRampToValueAtTime(0, end + 0.2);
    for (const o of [base, octave, lfo]) {
      try {
        o.stop(end + 0.25);
      } catch {
        /* zaten durmuş */
      }
    }
  };
}
