import { defineConfig } from 'vitest/config';

// Her test dosyası kendi gömülü PostgreSQL'ini (PGlite) açar; paralel açılış yavaş makinelerde 10 sn'yi aşabiliyor
export default defineConfig({
  test: { hookTimeout: 60_000, testTimeout: 30_000 },
});
