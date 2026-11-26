import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pacedUpload, type UploadPhase } from './uploadPace.ts';

describe('pacedUpload', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('anında biten gönderimde yüzde en az ~1,2 sn gösterilir, sonra okuma aşamasına geçilir', async () => {
    const seen: UploadPhase[] = [];
    const pace = pacedUpload((p) => seen.push(p));
    pace.sent();
    let ready = false;
    void pace.ready().then(() => (ready = true));
    await vi.advanceTimersByTimeAsync(600);
    expect(ready).toBe(false);
    const mid = seen.at(-1)!;
    expect(mid.phase).toBe('upload');
    expect(mid.phase === 'upload' && mid.percent).toBeGreaterThan(30);
    expect(mid.phase === 'upload' && mid.percent).toBeLessThan(70);
    await vi.advanceTimersByTimeAsync(1100);
    expect(ready).toBe(true);
    expect(seen.at(-1)).toEqual({ phase: 'reading' });
    expect(seen.some((p) => p.phase === 'upload' && p.percent === 100)).toBe(true);
  });

  it('yavaş gönderimde gerçek yüzdenin önüne geçmez', async () => {
    const seen: UploadPhase[] = [];
    const pace = pacedUpload((p) => seen.push(p));
    pace.progress(20);
    await vi.advanceTimersByTimeAsync(3000);
    expect(seen.at(-1)).toEqual({ phase: 'upload', percent: 20 });
    pace.stop();
  });
});
