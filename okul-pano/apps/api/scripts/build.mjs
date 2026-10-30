// API'yi tek dosyaya derler. Paylaşılan paket (@okulpano/shared) pakete gömülür,
// npm bağımlılıkları dışarıda bırakılır ve çalışma anında node_modules'ten yüklenir.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@okulpano/'));

await build({
  entryPoints: { index: 'src/index.ts', seed: 'src/seed.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [...external, ...external.map((d) => `${d}/*`)],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
