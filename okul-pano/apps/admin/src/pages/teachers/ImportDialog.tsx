import { ExcelImportDialog, type ImportPreview } from '../../components/ExcelImportDialog.tsx';
import { Toggle } from '../../components/ui.tsx';
import { useSchoolPath } from '../../lib/data.ts';

interface Row {
  fullName: string;
  branch: string | null;
  title: string | null;
  isActive?: boolean;
}

interface Preview extends ImportPreview<Row> {
  newBranches: string[];
  newTitles: string[];
}

interface Result {
  created: number;
  updated: number;
  branchesCreated: number;
  titlesCreated: number;
}

export function ImportDialog({ file, onClose }: { file: File | null; onClose: () => void }) {
  const basePath = useSchoolPath('teachers');
  return (
    <ExcelImportDialog<Row, Preview, { updateExisting: boolean }>
      file={file}
      onClose={onClose}
      basePath={basePath}
      invalidate={['teachers', 'teacher-branches', 'teacher-titles']}
      initialOptions={{ updateExisting: true }}
      columns={[
        { header: 'Ad soyad', cell: (r) => <span className="font-medium whitespace-nowrap text-ink">{r.fullName}</span> },
        { header: 'Branş', cell: (r) => r.branch ?? '—' },
        { header: 'Ünvan', cell: (r) => r.title ?? '—' },
      ]}
      stats={(p) => [
        { label: 'Yeni öğretmen', value: p.totals.new, tone: 'green' },
        { label: 'Güncellenecek', value: p.totals.update, tone: 'blue' },
        { label: 'Değişiklik yok', value: p.totals.unchanged, tone: 'slate' },
        { label: 'Atlanacak satır', value: p.totals.skipped, tone: p.totals.skipped ? 'amber' : 'slate' },
      ]}
      additions={(p) => [
        { label: 'Listeye eklenecek branşlar', values: p.newBranches },
        { label: 'Listeye eklenecek ünvanlar', values: p.newTitles },
      ]}
      renderOptions={(p, o, set) =>
        p.totals.update > 0 && (
          <Toggle
            checked={o.updateExisting}
            onChange={(v) => set({ updateExisting: v })}
            label="Sistemde kayıtlı öğretmenlerin branş ve ünvanını güncelle"
            description="Kapalıysa yalnızca yeni öğretmenler eklenir. Dosyadaki boş hücreler mevcut bilgiyi silmez."
          />
        )
      }
      rowStatus={(r, o) => (r.status === 'update' && !o.updateExisting ? 'unchanged' : r.status)}
      commitCount={(p, o) => p.totals.new + (o.updateExisting ? p.totals.update : 0)}
      commitLabel={(n) => `${n} öğretmeni kaydet`}
      commitBody={(p, o) => ({
        updateExisting: o.updateExisting,
        rows: p.rows.map(({ fullName, branch, title, isActive }) => ({ fullName, branch, title, isActive })),
      })}
      successMessage={(res: Result) => {
        const parts = [`${res.created} öğretmen eklendi`];
        if (res.updated) parts.push(`${res.updated} güncellendi`);
        if (res.branchesCreated) parts.push(`${res.branchesCreated} yeni branş`);
        if (res.titlesCreated) parts.push(`${res.titlesCreated} yeni ünvan`);
        return parts.join(', ');
      }}
    />
  );
}
