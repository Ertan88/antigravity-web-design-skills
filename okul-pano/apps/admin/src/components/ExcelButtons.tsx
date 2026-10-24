import { FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
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
}: {
  basePath: string;
  /** Dosya adındaki modül adı: "<Okul> - <modül>.xlsx", şablon için "<Okul> - <modül> Şablonu.xlsx" */
  module: string;
  /** Dosya adının sonuna eklenen dönem, ör. "Ekim 2026" */
  period?: string;
  canImport: boolean;
  onFile: (file: File) => void;
  /** İndirme adreslerine eklenecek sorgu (ör. "month=2026-10") */
  query?: string;
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
        excelFileName(school.data?.name, `${module}${kind === 'template' ? ' Şablonu' : ''}${period ? ` (${period})` : ''}`),
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
          <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
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
      <Button variant="secondary" icon={<FileDown className="size-4" />} loading={busy === 'export'} onClick={() => void download('export')}>
        Excel'e aktar
      </Button>
      {canImport && (
        <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={busy === 'template'} onClick={() => void download('template')}>
          Örnek şablon
        </Button>
      )}
    </>
  );
}
