import { Link } from 'react-router-dom';
import { Settings2 } from './icons.tsx';

/** Genel Ayarlar sekmeleri (sayfadaki bağlantılar ve Genel Ayarlar aynı adları kullanır) */
export type SettingsTab = 'okul' | 'gorev' | 'moduller' | 'takvim' | 'ogrenci' | 'mesleki' | 'pano' | 'destek';

/**
 * Ayar tek yerde durur (Genel Ayarlar); ilgili sayfada bu bağlantı doğrudan doğru sekmeyi açar.
 * Ör. Zil Saatleri › "Zil ayarları" → Genel Ayarlar › Takvim ve zil.
 */
export function SettingsLink({ tab, label, className }: { tab: SettingsTab; label: string; className?: string }) {
  return (
    <Link
      to={`/ayarlar?sekme=${tab}`}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-100 hover:text-ink dark:ring-white/15 dark:hover:bg-white/10 ${className ?? ''}`}
    >
      <Settings2 className="size-3.5" />
      {label}
    </Link>
  );
}
