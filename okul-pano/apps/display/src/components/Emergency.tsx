import { EMERGENCY_INFO, splitSchoolName, type DisplayEmergency } from '@okulpano/shared/client';
import { useEffect } from 'react';

/**
 * Siren: iki ton arasında kayan ses, birkaç tur çalıp kısa ara verir (sürekli çalıp uyarının
 * kendisini duyulmaz kılmasın diye). Tarayıcı ilk dokunuşa kadar sesi engellerse ilk tıklamada başlar;
 * kiosk kurulumundaki --autoplay-policy bayrağıyla doğrudan çalar.
 */
function useSiren(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 700;
    osc.connect(gain);
    osc.start();

    // 3 tur siren (her tur 1,2 sn yükselip alçalır), ardından 4 sn sessizlik
    const cycle = () => {
      const t = ctx.currentTime + 0.05;
      gain.gain.cancelScheduledValues(t);
      osc.frequency.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.08);
      for (let i = 0; i < 3; i++) {
        osc.frequency.setValueAtTime(650, t + i * 1.2);
        osc.frequency.linearRampToValueAtTime(1350, t + i * 1.2 + 0.6);
        osc.frequency.linearRampToValueAtTime(650, t + i * 1.2 + 1.2);
      }
      gain.gain.setValueAtTime(0.22, t + 3.5);
      gain.gain.linearRampToValueAtTime(0, t + 3.6);
    };
    const resume = () => void ctx.resume().catch(() => undefined);
    resume();
    cycle();
    const timer = setInterval(cycle, 7600);
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      try {
        osc.stop();
      } catch {
        /* zaten durmuş */
      }
      void ctx.close();
    };
  }, [enabled]);
}

function WarningIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** Acil durum: bütün panoyu kaplayan kırmızı uyarı, kısa talimatlar ve isteğe bağlı siren */
export function EmergencyScreen({
  emergency,
  now,
  timezone,
  schoolName,
  schoolType,
  muted,
}: {
  emergency: DisplayEmergency;
  now: Date;
  timezone: string;
  schoolName: string;
  schoolType?: string;
  /** Paneldeki önizlemede ses çalmaz */
  muted: boolean;
}) {
  useSiren(emergency.sound && !muted);
  const info = EMERGENCY_INFO[emergency.type];
  const title = splitSchoolName(schoolName, schoolType);
  const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: timezone });

  return (
    <div className="emergency" role="alert">
      <div className="emergency-top">
        <span className="emergency-badge">
          <WarningIcon size={30} /> ACİL DURUM
        </span>
        <span className="emergency-clock">{time.format(now)}</span>
      </div>
      <div className="emergency-main">
        <div className="emergency-icon">
          <WarningIcon size={190} />
        </div>
        <h1 className="emergency-title">{info.title}</h1>
        {emergency.message && <div className="emergency-message">{emergency.message}</div>}
        <ul className="emergency-steps">
          {info.instructions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="emergency-foot">
        <span>
          {title.name} {title.type}
        </span>
        <span>Başlangıç: {time.format(new Date(emergency.startedAt))}</span>
      </div>
    </div>
  );
}
