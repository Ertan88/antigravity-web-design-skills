import { FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { downloadFile, excelFileName } from '../lib/api.ts';
import { useSchool } from '../lib/data.ts';
import { useToast } from './Toast.tsx';
import { Button } from './ui.tsx';

/**
 * Sayfa başlığındaki Excel düğmeleri: yükle, dışa aktar, örnek şablon.
 * `basePath` altında /template, /export ve /import/preview uç noktaları beklenir.
 */
export function ExcelButtons({
  basePath,
  module,
  period,
  canImport,
  onFile,
  query,
  size,
  afterImport,
}: {
  basePath: string;
  /** Dosya adındaki modül adı: "<Okul> - <modül>.xlsx"; şablon okul adı olmadan "<modül> Şablonu.xlsx" */
  module: string;
  /** Dosya adının sonuna eklenen dönem, ör. "Ekim 2026" */
  period?: string;
  canImport: boolean;
  onFile: (file: File) => void;
  /** İndirme adreslerine eklenecek sorgu (ör. "month=2026-10") */
  query?: string;
  /** Liste üstündeki araç çubuğunda küçük düğmeler */
  size?: 'sm';
  /** "Excel'den yükle"nin hemen ardından gelecek düğme (ör. yapıştırarak ekle) */
  afterImport?: ReactNode;
}) {
  const toast = useToast();
  const school = useSchool();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'template' | 'export' | null>(null);

  const download = async (kind: 'template' | 'export') => {
    setBusy(kind);
    try {
      await downloadFile(
        `${basePath}/${kind}${query ? `?${query}` : ''}`,
        excelFileName(kind === 'template' ? undefined : school.data?.name, `${module}${kind === 'template' ? ' Şablonu' : ''}${period ? ` (${period})` : ''}`),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İndirilemedi');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {canImport && (
        <>
          <Button variant="secondary" size={size} icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
            Excel'den yükle
          </Button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label="Excel dosyası seç"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </>
      )}
      {afterImport}
      <Button variant="secondary" size={size} icon={<FileDown className="size-4" />} loading={busy === 'export'} onClick={() => void download('export')}>
        Excel'e aktar
      </Button>
      {canImport && (
        <Button variant={size ? 'secondary' : 'ghost'} size={size} icon={<FileSpreadsheet className="size-4" />} loading={busy === 'template'} onClick={() => void download('template')}>
          Örnek şablon
        </Button>
      )}
    </>
  );
}
