import { pairScreenSchema, screenSchema } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, MonitorSmartphone, Pencil, Plus, RefreshCw, ScanEye } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, DeleteButton, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchool, useSchoolPath, type Screen } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';
import { timeAgo } from '../lib/format.ts';

const DISPLAY_URL = (import.meta.env.VITE_DISPLAY_URL as string | undefined) ?? '/display/';
const absoluteDisplayUrl = () => new URL(DISPLAY_URL, location.origin).toString();

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button
        variant="secondary"
        icon={copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </Button>
    </div>
  );
}

function AddScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('screens');
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<'code' | 'link'>('code');
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const form = useForm({ code: '', name: '', location: '' });

  const done = () => void qc.invalidateQueries({ queryKey: [schoolId, 'screens'] });
  const close = () => {
    form.reset({ code: '', name: '', location: '' });
    setSetupUrl(null);
    onClose();
  };

  const pair = useMutation({ mutationFn: (body: unknown) => api(`${path}/pair`, { method: 'POST', body }) });
  const create = useMutation({ mutationFn: (body: unknown) => api<{ token: string }>(path, { method: 'POST', body }) });

  const submit = async () => {
    const v = form.values;
    try {
      if (mode === 'code') {
        const payload = form.validate(pairScreenSchema, { code: v.code, name: v.name, location: v.location || null });
        if (!payload) return;
        await pair.mutateAsync(payload);
        toast.success(`"${v.name}" bağlandı; ekran birkaç saniye içinde panoya geçecek`);
        done();
        close();
      } else {
        const payload = form.validate(screenSchema, { name: v.name, location: v.location || null });
        if (!payload) return;
        const { token } = await create.mutateAsync(payload);
        setSetupUrl(`${absoluteDisplayUrl()}?key=${token}`);
        done();
      }
    } catch (err) {
      form.fail(err);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Ekran ekle"
      description="TV'de pano adresini açın; ekranda görünen 6 haneli kodu buraya girin."
      footer={
        setupUrl ? (
          <Button onClick={close}>Tamam</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Vazgeç
            </Button>
            <Button loading={pair.isPending || create.isPending} onClick={() => void submit()}>
              {mode === 'code' ? 'Eşleştir' : 'Bağlantı oluştur'}
            </Button>
          </>
        )
      }
    >
      {setupUrl ? (
        <div className="space-y-4">
          <Alert tone="blue">Bu bağlantıyı ekrandaki tarayıcıda bir kez açın. Bağlantı ekranın anahtarını içerir; başkalarıyla paylaşmayın.</Alert>
          <CopyField value={setupUrl} />
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'code', label: 'Kodla eşleştir' },
              { value: 'link', label: 'Kurulum bağlantısı' },
            ]}
          />
          {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
          {mode === 'code' && (
            <Field label="Eşleştirme kodu" error={form.errors.code} help={<>Ekranda pano adresini açın: <span className="font-mono">{absoluteDisplayUrl()}</span></>}>
              {(id) => (
                <Input
                  id={id}
                  value={form.values.code}
                  onChange={(e) => form.set('code', e.target.value.toUpperCase())}
                  maxLength={7}
                  autoComplete="off"
                  placeholder="ABC123"
                  className="h-14 text-center font-mono text-2xl font-bold tracking-[0.4em]"
                  invalid={Boolean(form.errors.code)}
                />
              )}
            </Field>
          )}
          <Field label="Ekran adı" error={form.errors.name}>
            {(id) => <Input id={id} value={form.values.name} onChange={(e) => form.set('name', e.target.value)} placeholder="ör. Giriş Holü" invalid={Boolean(form.errors.name)} />}
          </Field>
          <Field label="Konum (isteğe bağlı)" error={form.errors.location}>
            {(id) => <Input id={id} value={form.values.location} onChange={(e) => form.set('location', e.target.value)} placeholder="ör. Zemin kat, kantin karşısı" />}
          </Field>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Modal>
  );
}

export function Screens() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('screens');
  const qc = useQueryClient();
  const toast = useToast();
  const list = useList<Screen>('screens', { refetchInterval: 10_000 });
  const school = useSchool();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Screen | null>(null);
  const [keyUrl, setKeyUrl] = useState<string | null>(null);
  const renameForm = useForm({ name: '', location: '' });
  const refresh = () => void qc.invalidateQueries({ queryKey: [schoolId, 'screens'] });

  const command = useMutation({
    mutationFn: ({ id, command }: { id: string; command: 'reload' | 'identify' }) =>
      api<{ delivered: boolean }>(`${path}/${id}/command`, { method: 'POST', body: { command } }),
    onSuccess: (r, v) =>
      r.delivered
        ? toast.success(v.command === 'reload' ? 'Ekran yenileniyor' : 'Ekranda adı 15 saniye gösterilecek')
        : toast.error('Ekran çevrimdışı; komut iletilemedi'),
  });
  const rotate = useMutation({
    mutationFn: (id: string) => api<{ token: string }>(`${path}/${id}/rotate-key`, { method: 'POST' }),
    onSuccess: (r) => setKeyUrl(`${absoluteDisplayUrl()}?key=${r.token}`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Ekran silindi; cihaz eşleştirme ekranına döndü');
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api(`${path}/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      refresh();
      setRenaming(null);
    },
  });

  const count = list.data?.length ?? 0;
  const max = school.data?.maxScreens ?? 0;

  return (
    <>
      <PageHeader
        title="Ekranlar"
        description="Okuldaki her TV bir ekrandır. Ekranları uzaktan yenileyebilir, hangisinin hangisi olduğunu ekranda adını göstererek bulabilirsiniz."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)} disabled={Boolean(max) && count >= max}>
            Ekran ekle
          </Button>
        }
      />
      {max > 0 && (
        <div className="mb-4 flex items-center gap-3 text-sm text-slate-500">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (count / max) * 100)}%` }} />
          </div>
          Paketinizde {max} ekrandan {count} tanesi kullanılıyor
        </div>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : !count ? (
        <Card>
          <EmptyState
            icon={<MonitorSmartphone className="size-6" />}
            title="Henüz ekran yok"
            description="TV'ye bağlı bilgisayarda ya da Raspberry Pi'de pano adresini açın, çıkan kodu girin."
            action={<Button onClick={() => setAdding(true)}>İlk ekranı ekle</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data!.map((s) => (
            <Card key={s.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <MonitorSmartphone className="size-5" />
                </div>
                {s.online ? (
                  <Badge tone="green" dot>
                    Çevrimiçi
                  </Badge>
                ) : (
                  <Badge tone={s.lastSeenAt ? 'amber' : 'slate'}>{s.lastSeenAt ? `Son görülme ${timeAgo(s.lastSeenAt)}` : 'Hiç bağlanmadı'}</Badge>
                )}
              </div>
              <h2 className="mt-4 font-semibold">{s.name}</h2>
              <p className="text-sm text-slate-500">{s.location ?? 'Konum belirtilmemiş'}</p>
              <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
                <Button size="sm" variant="ghost" icon={<ScanEye className="size-3.5" />} onClick={() => command.mutate({ id: s.id, command: 'identify' })}>
                  Tanımla
                </Button>
                <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => command.mutate({ id: s.id, command: 'reload' })}>
                  Yenile
                </Button>
                <div className="ml-auto flex">
                  <IconButton
                    label="Adını değiştir"
                    onClick={() => {
                      renameForm.reset({ name: s.name, location: s.location ?? '' });
                      setRenaming(s);
                    }}
                  >
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label="Anahtarı yenile" onClick={() => rotate.mutate(s.id)}>
                    <KeyRound className="size-4" />
                  </IconButton>
                  <DeleteButton onConfirm={() => remove.mutate(s.id)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8 p-5">
        <h2 className="font-semibold">Raspberry Pi / kiosk kurulumu</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ekranın açılışta panoyu tam ekran başlatması için Chromium'u kiosk modunda çalıştırın. Videoların sesli oynaması için otomatik oynatma iznini açın.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-[#e2e8f0]">
          {`chromium-browser --kiosk --noerrdialogs --disable-infobars \\
  --autoplay-policy=no-user-gesture-required \\
  --check-for-update-interval=31536000 \\
  "${absoluteDisplayUrl()}"`}
        </pre>
      </Card>

      <AddScreen open={adding} onClose={() => setAdding(false)} />

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Ekranı düzenle"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Vazgeç
            </Button>
            <Button
              loading={rename.isPending}
              onClick={() => {
                const payload = renameForm.validate(screenSchema, { name: renameForm.values.name, location: renameForm.values.location || null });
                if (payload && renaming) rename.mutate({ id: renaming.id, body: payload });
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Ekran adı" error={renameForm.errors.name}>
            {(id) => <Input id={id} value={renameForm.values.name} onChange={(e) => renameForm.set('name', e.target.value)} />}
          </Field>
          <Field label="Konum">
            {(id) => <Input id={id} value={renameForm.values.location} onChange={(e) => renameForm.set('location', e.target.value)} />}
          </Field>
        </div>
      </Modal>

      <Modal open={Boolean(keyUrl)} onClose={() => setKeyUrl(null)} title="Yeni kurulum bağlantısı" footer={<Button onClick={() => setKeyUrl(null)}>Tamam</Button>}>
        <div className="space-y-4">
          <Alert>Eski anahtar artık geçersiz; ekran eşleştirme ekranına döndü. Bu bağlantıyı ekranda açarak yeniden bağlayın.</Alert>
          {keyUrl && <CopyField value={keyUrl} />}
        </div>
      </Modal>
    </>
  );
}
