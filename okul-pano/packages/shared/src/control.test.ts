import { describe, expect, it } from 'vitest';
import { isLiteMode, resolveScreenDisplay, webViewVersion } from './screen.ts';

describe('ekran biçimi', () => {
  it('tam ekran saat modu tanınır', () => {
    expect(resolveScreenDisplay({ mode: 'clock' }).mode).toBe('clock');
    expect(resolveScreenDisplay({ mode: 'video' as never }).mode).toBe('board');
  });
});

describe('animasyonlar: hafif mod kararı', () => {
  const tvOld = 'Mozilla/5.0 (Linux; Android 9; TCL TV; wv) AppleWebKit/537.36 Chrome/83.0.4103.106 Safari/537.36 OkulYayinPano/1.4.1';
  const tvNew = 'Mozilla/5.0 (Linux; Android 11; TCL TV; wv) AppleWebKit/537.36 Chrome/138.0.7204.63 Safari/537.36 OkulYayinPano/1.4.1';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
  it('otomatik: yalnızca eski WebView hafif', () => {
    expect(isLiteMode('auto', tvOld)).toBe(true);
    expect(isLiteMode('auto', tvNew)).toBe(false);
    expect(isLiteMode('auto', desktop)).toBe(false);
    expect(webViewVersion(tvNew)).toBe(138);
  });
  it('elle seçim her zaman geçerli', () => {
    expect(isLiteMode('lite', desktop)).toBe(true);
    expect(isLiteMode('on', tvOld)).toBe(false);
  });
  it('kayıtlı değer yoksa otomatik', () => {
    expect(resolveScreenDisplay({}).animations).toBe('auto');
    expect(resolveScreenDisplay({ animations: 'x' as never }).animations).toBe('auto');
  });
});
