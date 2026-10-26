import { describe, expect, it } from 'vitest';
import { resolveScreenDisplay } from './screen.ts';

describe('ekran biçimi', () => {
  it('tam ekran saat modu tanınır', () => {
    expect(resolveScreenDisplay({ mode: 'clock' }).mode).toBe('clock');
    expect(resolveScreenDisplay({ mode: 'video' as never }).mode).toBe('board');
  });
});
