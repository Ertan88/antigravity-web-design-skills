import { normalizeName } from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton, Input, Select } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath, type TeacherOption } from '../../lib/data.ts';

export type OptionKind = 'teacher-branches' | 'teacher-titles';

export const OPTION_LABEL: Record<OptionKind, { one: string; many: string }> = {
  'teacher-branches': { one: 'branş', many: 'Branşlar' },
  'teacher-titles': { one: 'ünvan', many: 'Ünvanlar' },
};

const NEW = '__new__';

/**
 * Branş / ünvan seçici. Listenin sonundaki "Yeni ... ekle" ile formdan çıkmadan
 * yeni değer eklenir ve seçili hale gelir.
 */
export function OptionSelect({
  id,
  kind,
  options,
  value,
  onChange,
}: {
  id: string;
  kind: OptionKind;
  options: TeacherOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { schoolId } = useAuth();
  const path = useSchoolPath(kind);
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = OPTION_LABEL[kind].one;

  const save = async () => {
    const clean = name.trim();
    if (!clean) return;
    // Zaten listede varsa yenisini açmak yerine onu seç
    const existing = options.find((o) => normalizeName(o.name) === normalizeName(clean));
    if (existing) {
      onChange(existing.id);
      setAdding(false);
      setName('');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>(path, { method: 'POST', body: { name: clean } });
      await qc.invalidateQueries({ queryKey: [schoolId, kind] });
      onChange(created.id);
      setAdding(false);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  if (adding) {
    return (
      <div>
        <div className="flex gap-2">
          <Input
            id={id}
            autoFocus
            value={name}
            maxLength={60}
            placeholder={`Yeni ${label} adı`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
              if (e.key === 'Escape') setAdding(false);
            }}
          />
          <Button loading={busy} icon={<Check className="size-4" />} onClick={() => void save()}>
            Ekle
          </Button>
          <IconButton label="Vazgeç" onClick={() => setAdding(false)}>
            <X className="size-4" />
          </IconButton>
        </div>
        {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW) setAdding(true);
        else onChange(e.target.value);
      }}
    >
      <option value="">Seçilmedi</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
      <option value={NEW}>+ Yeni {label} ekle…</option>
    </Select>
  );
}
