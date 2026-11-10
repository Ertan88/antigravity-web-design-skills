import { defaultTitleRole, ENROLL_ROLES, type EnrollRole } from '@okulpano/shared';
import { useEffect, useState } from 'react';
import { Check, Copy } from '../../components/icons.tsx';
import { QrCode } from '../../components/QrCode.tsx';
import { Alert, Badge, Button, Input, Modal, Select } from '../../components/ui.tsx';
import type { TeacherOption } from '../../lib/data.ts';

/* Kişiler ve Yetkiler: giriş kodu, toplantı QR'ı ve ünvan → rol pencereleri */

export const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

export function useCountdown(until: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return '';
  const left = Math.max(0, new Date(until).getTime() - now);
  return left ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : 'süresi doldu';
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Bağlantı" />
      <Button
        variant="secondary"
        icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </Button>
    </div>
  );
}

/** Kişi başı giriş kodu: yalnızca bu ekranda görünür, 15 dakika geçerli, bir kez kullanılır */
export function CodeDialog({ value, onClose }: { value: { code: string; url: string; expiresAt: string; fullName: string } | null; onClose: () => void }) {
  const left = useCountdown(value?.expiresAt ?? null);
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={`${value?.fullName ?? ''} · giriş kodu`} footer={<Button onClick={onClose}>Kapat</Button>}>
      {value && (
        <div className="flex flex-col items-center gap-4 text-center">
          <QrCode value={value.url} size={220} label="Giriş kodu QR" />
          <div className="font-mono text-4xl font-extrabold tracking-[0.2em] text-ink">{formatCode(value.code)}</div>
          <Badge tone={left === 'süresi doldu' ? 'red' : 'amber'}>{left === 'süresi doldu' ? 'Süresi doldu' : `${left} içinde kullanılmalı`}</Badge>
          <p className="max-w-md text-sm text-slate-600">
            Öğretmen telefonuyla QR'ı okutur ya da uygulamada “Giriş kodum var”a dokunup kodu yazar. Ardından e-postasını doğrular ve şifresini belirler. Kod bir kez
            kullanılır; kâğıda yazmayın, yalnızca bu ekranda gösterin.
          </p>
        </div>
      )}
    </Modal>
  );
}

/** Toplantı QR'ı: projeksiyona yansıtılır; öğretmen kadrodan adını seçer, hesap onayınızla açılır */
export function MeetingDialog({ value, onClose, onStop }: { value: { url: string; expiresAt: string } | null; onClose: () => void; onStop: () => void }) {
  const left = useCountdown(value?.expiresAt ?? null);
  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      size="lg"
      title="Toplantı QR'ı"
      description="Projeksiyona yansıtın. Öğretmenler okutup kadrodan adını seçer, e-postasını doğrular ve şifresini belirler. Hesaplar siz onaylayınca açılır."
      footer={
        <>
          <Button variant="secondary" onClick={onStop}>
            Bağlantıyı şimdi kapat
          </Button>
          <Button onClick={onClose}>Tamam</Button>
        </>
      }
    >
      {value && (
        <div className="flex flex-col items-center gap-4">
          <QrCode value={value.url} size={320} label="Toplantı QR" />
          <Badge tone={left === 'süresi doldu' ? 'red' : 'blue'}>{left === 'süresi doldu' ? 'Süresi doldu' : `${left} daha geçerli`}</Badge>
          <div className="w-full">
            <CopyLink url={value.url} />
          </div>
          <Alert>Başkası bir öğretmenin adını seçebileceği için her hesap “Onay bekliyor” olarak düşer; adı ve e-postayı kontrol edip onaylayın.</Alert>
        </div>
      )}
    </Modal>
  );
}

/** Kadrodaki ünvan → önerilen rol (okul kendisi belirler; ünvan adları koda sabit değildir) */
export function TitleRoleDialog({
  open,
  onClose,
  titles,
  value,
  isOwner,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  titles: TeacherOption[];
  value: Record<string, EnrollRole>;
  isOwner: boolean;
  onSave: (v: Record<string, EnrollRole>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, EnrollRole>>(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ünvan → rol"
      description="Kadrodaki ünvana göre hesap açılırken önerilecek rol. Müdür yardımcısı ünvanları için Yönetici önerilir; isterseniz değiştirin. Her öğretmen için ayrıca da değiştirebilirsiniz."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                // Varsayılan öneriyle aynı olanlar saklanmaz (ör. müdür yardımcısı → Yönetici); farklı seçim saklanır
                const nameOf = (id: string) => titles.find((t) => t.id === id)?.name;
                await onSave(Object.fromEntries(Object.entries(draft).filter(([id, r]) => r !== defaultTitleRole(nameOf(id)))));
              } finally {
                setSaving(false);
              }
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="divide-y divide-slate-100">
        {titles
          .filter((t) => t.teacherCount > 0 || draft[t.id])
          .map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">{t.name}</div>
                <div className="text-xs text-slate-500">{t.teacherCount} öğretmen</div>
              </div>
              <div className="w-48">
                <Select value={draft[t.id] ?? defaultTitleRole(t.name)} onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value as EnrollRole }))} aria-label={`${t.name} rolü`}>
                  {(Object.keys(ENROLL_ROLES) as EnrollRole[])
                    .filter((k) => k !== 'admin' || isOwner || (draft[t.id] ?? defaultTitleRole(t.name)) === 'admin')
                    .map((k) => (
                      <option key={k} value={k}>
                        {ENROLL_ROLES[k]}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
          ))}
      </div>
    </Modal>
  );
}
