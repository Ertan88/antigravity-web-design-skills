import { EMERGENCY_INFO, splitSchoolName, startWailSiren, type DisplayEmergency } from '@okulpano/shared/client';
import { useEffect, useState } from 'react';
import { SchoolIcon } from './Icons.tsx';

function useSiren(enabled: boolean): boolean {
  // Tarayıcı sesi engellediyse (dokunuş bekliyor) ekranda "dokunun" ipucu gösterilir
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const stop = startWailSiren(ctx);
    const sync = () => setBlocked(ctx.state !== 'running');
    ctx.addEventListener('statechange', sync);
    const resume = () => void ctx.resume().then(sync, sync);
    resume();
    // Bazı tarayıcılar ilk resume'u sessizce bekletir: kısa süre sonra durum yeniden okunur
    const check = setTimeout(sync, 800);
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      clearTimeout(check);
      setBlocked(false);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      stop();
      setTimeout(() => void ctx.close(), 400);
    };
  }, [enabled]);
  return blocked;
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
  logoUrl,
  muted,
}: {
  emergency: DisplayEmergency;
  now: Date;
  timezone: string;
  schoolName: string;
  schoolType?: string;
  logoUrl: string | null;
  /** Paneldeki önizlemede ses çalmaz */
  muted: boolean;
}) {
  const blocked = useSiren(emergency.sound && !muted);
  const info = EMERGENCY_INFO[emergency.type];
  const title = splitSchoolName(schoolName, schoolType);
  const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: timezone });

  return (
    <div className="emergency" role="alert">
      <div className="emergency-top">
        <span className="emergency-badge">
          <WarningIcon size={30} /> ACİL DURUM
        </span>
        {blocked && <span className="emergency-sound-hint">Sireni başlatmak için ekrana dokunun</span>}
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
        <span className="emergency-school">
          <span className="emergency-logo">{logoUrl ? <img src={logoUrl} alt="" /> : <SchoolIcon size={30} />}</span>
          {title.name} {title.type}
        </span>
        <span>Başlangıç: {time.format(new Date(emergency.startedAt))}</span>
      </div>
    </div>
  );
}
