import { errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, fetchBlob, saveBlob } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchoolPath } from '../lib/data.ts';
import { formatDateTime } from '../lib/format.ts';
import { confirm } from './confirm.tsx';
import { Download, Lock, Upload } from './icons.tsx';
import { useToast } from './Toast.tsx';
import { Alert, Badge, Button, Card } from './ui.tsx';

/*
 * Genel Ayarlar › Okul › Okul yedeği (ücretli sürüm): okulun bütün kayıtları ve görselleri tek ZIP dosyasında iner;
 * aynı okulun yedeği geri yüklenebilir (en ağır işlem: okulun kısa adı yazılır, sonra basılı tutulur). Ücretsiz
 * denemede kart kilitli görünür. Yalnızca okul müdürüne görünür. KVKK bölümündeki "Verileri indir" herkese açık kalır.
 */

interface Status {
  allowed: boolean;
  locked: boolean;
  lastBackupAt: string | null;
  lastRestoreAt: string | null;
}

export function BackupCard({ slug }: { slug: string }) {
  const path = useSchoolPath('backup');
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: [schoolId, 'backup'], queryFn: () => api<Status>(path) });
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = status.data;
  if (!s?.allowed) return null;

  const take = async () => {
    setBusy('backup');
    try {
      saveBlob(await fetchBlob(`${path}.zip`), `Okul yedeği ${new Date().toLocaleDateString('tr-TR')}.zip`);
      void status.refetch();
    } catch (err) {
      toast.error(errorText(err, 'Yedek alınamadı'));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (file: File) => {
    const ok = await confirm({
      title: 'Yedek geri yüklensin mi?',
      subtitle: file.name,
      tone: 'danger',
      effects: [
        { text: 'Öğretmenler, öğrenciler, nöbet, ders programı, duyurular, görseller ve diğer kayıtlar yedekteki hâline döner' },
        { text: 'Yedekten sonra girilen kayıtlar silinir' },
        { text: 'Kullanıcı hesapları, şifreler ve panolar (TV eşleştirmeleri) değişmez', ok: true },
      ],
      typed: { value: slug, label: `Onaylamak için okulun kısa adını yazın: ${slug}` },
      hold: true,
      holdLabel: 'Geri yüklemek için basılı tutun',
    });
    if (!ok) return;
    setBusy('restore');
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api<{ createdAt: string | null }>(`${path}/restore?confirm=${encodeURIComponent(slug)}`, { method: 'POST', form });
      await qc.invalidateQueries();
      toast.success(`Yedek geri yüklendi${r.createdAt ? ` (${formatDateTime(r.createdAt)} tarihli)` : ''}.`);
    } catch (err) {
      toast.error(errorText(err, 'Geri yüklenemedi'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">Okul yedeği</h2>
        {s.locked && (
          <Badge tone="amber">
            <Lock className="mr-1 inline size-3.5" />
            Ücretli sürümde
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Okulun bütün kayıtları ve görselleri tek dosyada (ZIP) iner; gerektiğinde aynı okula geri yüklenir. Dosya kişisel veri içerir, güvenli saklayın.
      </p>
      {s.locked ? (
        <div className="mt-4">
          <Alert tone="amber">
            Yedekleme ücretli sürümde kullanılır. Deneme süresince verileriniz sunucuda her gece yedeklenir; KVKK bölümündeki “Verileri indir” ile de kayıtlarınızı alabilirsiniz.{' '}
            <a href="/#fiyatlar" target="_blank" rel="noreferrer" className="font-semibold underline">
              Paketleri incele
            </a>
          </Alert>
        </div>
      ) : (
        (s.lastBackupAt || s.lastRestoreAt) && (
          <p className="mt-3 text-xs text-slate-500">
            {[s.lastBackupAt && `Son yedek: ${formatDateTime(s.lastBackupAt)}`, s.lastRestoreAt && `Son geri yükleme: ${formatDateTime(s.lastRestoreAt)}`].filter(Boolean).join(' · ')}
          </p>
        )
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon={<Download className="size-4" />} disabled={s.locked || Boolean(busy)} loading={busy === 'backup'} onClick={() => void take()}>
          Yedek al
        </Button>
        <Button variant="secondary" icon={<Upload className="size-4" />} disabled={s.locked || Boolean(busy)} loading={busy === 'restore'} onClick={() => input.current?.click()}>
          Yedekten geri yükle
        </Button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void restore(f);
          }}
        />
      </div>
    </Card>
  );
}
