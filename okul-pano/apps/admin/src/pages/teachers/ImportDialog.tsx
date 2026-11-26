import { ExcelImportDialog, type ImportPreview } from '../../components/ExcelImportDialog.tsx';
import { Toggle } from '../../components/ui.tsx';
import { useSchoolPath } from '../../lib/data.ts';

interface Row {
  fullName: string;
  branch: string | null;
  title: string | null;
  email?: string | null;
  phone?: string | null;
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
        { header: 'Branş', cell: (r) => r.branch ?? '—', value: (r) => r.branch },
        { header: 'Görev', cell: (r) => r.title ?? '—', value: (r) => r.title },
        // e-Okul PDF'inde e-posta ve telefon yoktur: bütün satırlarda boşsa sütun gösterilmez
        { header: 'E-posta', cell: (r) => r.email ?? '—', value: (r) => r.email },
        { header: 'Telefon', cell: (r) => r.phone ?? '—', value: (r) => r.phone },
      ]}
      stats={(p) => [
        { label: 'Yeni öğretmen', value: p.totals.new, tone: 'green' },
        { label: 'Güncellenecek', value: p.totals.update, tone: 'blue' },
        { label: 'Değişiklik yok', value: p.totals.unchanged, tone: 'slate' },
        { label: 'Atlanacak satır', value: p.totals.skipped, tone: p.totals.skipped ? 'amber' : 'slate' },
      ]}
      additions={(p) => [
        { label: 'Listeye eklenecek branşlar', values: p.newBranches },
        { label: 'Listeye eklenecek görevler', values: p.newTitles },
      ]}
      renderOptions={(p, o, set) =>
        p.totals.update > 0 && (
          <Toggle
            checked={o.updateExisting}
            onChange={(v) => set({ updateExisting: v })}
            label="Sistemde kayıtlı öğretmenlerin ad yazımını, branş, görev ve iletişim bilgisini güncelle"
            description="Kapalıysa yalnızca yeni öğretmenler eklenir. Dosyadaki boş hücreler mevcut bilgiyi silmez."
          />
        )
      }
      rowStatus={(r, o) => (r.status === 'update' && !o.updateExisting ? 'unchanged' : r.status)}
      commitCount={(p, o) => p.totals.new + (o.updateExisting ? p.totals.update : 0)}
      commitLabel={(n) => `${n} öğretmeni kaydet`}
      commitBody={(p, o) => ({
        updateExisting: o.updateExisting,
        rows: p.rows.map(({ fullName, branch, title, email, phone, isActive }) => ({ fullName, branch, title, email, phone, isActive })),
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
