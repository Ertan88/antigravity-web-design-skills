/**
 * Panel telefonda: öğretmen görünümündeki kişi (öğretmen kaydı olan, ya da görevi olmayan) uygulamanın web sürümüne
 * (/app) geçer; yönetici ve kadro dışı görevli panelde kalır. "Paneli aç" (/admin/?panel=1) seçimi bu telefonda saklanır.
 */
const PANEL_ON_PHONE = 'okulpano.panelOnPhone';
/** /app'in kendi deposu (mobil uygulamanın web sürümü aynı anahtarları okur) */
const APP_KEYS = { refresh: 'okulpano.refresh', school: 'okulpano.school', me: 'okulpano.me', user: 'okulpano.handoffUser' } as const;

// Adres yönlendirmeyle değişmeden önce okunur: /admin/?panel=1 ile gelen kişinin seçimi saklanır
panelChosenOnPhone();

/** Panelin dar ekran (telefon) düzeni: kenar menü açılır menüye döner */
export function isPhoneWidth(): boolean {
  try {
    return window.matchMedia('(max-width: 1023px)').matches;
  } catch {
    return false;
  }
}

/** Kişi telefonda paneli seçti mi? Adreste ?panel=1 varsa seçim saklanır */
export function panelChosenOnPhone(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('panel') === '1') {
      localStorage.setItem(PANEL_ON_PHONE, '1');
      return true;
    }
    return localStorage.getItem(PANEL_ON_PHONE) === '1';
  } catch {
    return false;
  }
}

/**
 * Uygulama görünümünü açar: /app sunucuda yoksa hiçbir şey yapmaz (false). Paneldeki oturumla /app için ayrı bir
 * oturum alınır; kişi ikinci kez giriş yapmaz. Aynı kişinin /app oturumu zaten varsa yenisi açılmaz.
 */
export async function openAppView(userId: string, schoolId: string | null): Promise<boolean> {
  try {
    const head = await fetch('/app/', { method: 'HEAD' });
    if (!head.ok) return false;
    if (!(localStorage.getItem(APP_KEYS.refresh) && localStorage.getItem(APP_KEYS.user) === userId)) {
      const res = await fetch('/api/auth/app-session', { method: 'POST', credentials: 'same-origin', headers: { 'x-okul-handoff': '1' } });
      if (!res.ok) return false;
      const body = (await res.json()) as { refreshToken: string };
      localStorage.setItem(APP_KEYS.refresh, body.refreshToken);
      localStorage.setItem(APP_KEYS.user, userId);
      localStorage.removeItem(APP_KEYS.me);
    }
    if (schoolId) localStorage.setItem(APP_KEYS.school, schoolId);
    window.location.replace('/app/?panelden=1');
    return true;
  } catch {
    return false;
  }
}
