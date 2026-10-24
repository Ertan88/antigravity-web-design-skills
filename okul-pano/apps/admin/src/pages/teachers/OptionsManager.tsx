import { trCompare } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ListPlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Badge, Button, IconButton, Input, Modal, Segmented, Spinner } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useList, useSchoolPath, type TeacherOption } from '../../lib/data.ts';
import { OPTION_LABEL, type OptionKind } from './OptionSelect.tsx';

function OptionRow({ kind, option }: { kind: OptionKind; option: TeacherOption }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath(kind);
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(option.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: [schoolId, kind] }), qc.invalidateQueries({ queryKey: [schoolId, 'teachers'] })]);

  const rename = useMutation({
    mutationFn: () => api(`${path}/${option.id}`, { method: 'PUT', body: { name } }),
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`${path}/${option.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh();
      toast.success(`"${option.name}" silindi`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-2">
        <Input
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename.mutate();
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-label="Yeni ad"
        />
        <IconButton label="Kaydet" onClick={() => rename.mutate()} disabled={!name.trim() || rename.isPending}>
          <Check className="size-4" />
        </IconButton>
        <IconButton
          label="Vazgeç"
          onClick={() => {
            setName(option.name);
            setEditing(false);
          }}
        >
          <X className="size-4" />
        </IconButton>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{option.name}</span>
      <Badge tone={option.teacherCount ? 'blue' : 'slate'}>{option.teacherCount} öğretmen</Badge>
      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => remove.mutate()}
            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            {option.teacherCount ? `Sil (${option.teacherCount} öğretmende boşalır)` : 'Sil'}
          </button>
          <IconButton label="Vazgeç" onClick={() => setConfirmDelete(false)}>
            <X className="size-4" />
          </IconButton>
        </div>
      ) : (
        <div className="flex pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
          <IconButton label="Adını değiştir" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label="Sil" className="hover:bg-red-50 hover:text-red-600" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      )}
    </li>
  );
}

/** Branş ve ünvan listelerini yönetme: ekle, yeniden adlandır (tüm öğretmenlerde değişir), sil. */
export function OptionsManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useAuth();
  const [kind, setKind] = useState<OptionKind>('teacher-branches');
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const list = useList<TeacherOption>(kind);
  const path = useSchoolPath(kind);
  const defaultsPath = useSchoolPath('teacher-catalog/defaults');
  const label = OPTION_LABEL[kind];

  const add = useMutation({
    mutationFn: () => api(path, { method: 'POST', body: { name } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [schoolId, kind] });
      setName('');
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const defaults = useMutation({
    mutationFn: () => api<{ branchesAdded: number; titlesAdded: number }>(defaultsPath, { method: 'POST' }),
    onSuccess: async (r) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [schoolId, 'teacher-branches'] }),
        qc.invalidateQueries({ queryKey: [schoolId, 'teacher-titles'] }),
      ]);
      toast.success(r.branchesAdded + r.titlesAdded ? `${r.branchesAdded} branş ve ${r.titlesAdded} ünvan eklendi` : 'Önerilen listenin tamamı zaten mevcut');
    },
  });

  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const rows = [...(list.data ?? [])]
    .filter((o) => !needle || o.name.toLocaleLowerCase('tr-TR').includes(needle))
    .sort((a, b) => trCompare(a.name, b.name));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Branş ve ünvanlar"
      description="Bir adı değiştirdiğinizde o branştaki ya da ünvandaki tüm öğretmenlerde değişir."
      footer={
        <>
          <Button variant="ghost" className="mr-auto" icon={<ListPlus className="size-4" />} loading={defaults.isPending} onClick={() => defaults.mutate()}>
            Önerilen listeyi ekle
          </Button>
          <Button onClick={onClose}>Tamam</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k);
            setError(null);
            setQ('');
          }}
          options={[
            { value: 'teacher-branches', label: 'Branşlar' },
            { value: 'teacher-titles', label: 'Ünvanlar' },
          ]}
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate();
          }}
        >
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={`Yeni ${label.one} adı`} aria-label={`Yeni ${label.one}`} />
          <Button type="submit" loading={add.isPending} icon={<Plus className="size-4" />} disabled={!name.trim()}>
            Ekle
          </Button>
        </form>
        {error && <p className="-mt-2 text-xs font-medium text-red-600">{error}</p>}
        {(list.data?.length ?? 0) > 8 && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${label.many} içinde ara`} className="pl-9" aria-label="Listede ara" />
          </div>
        )}
        {list.isLoading ? (
          <Spinner />
        ) : (
          <ul className="max-h-[45vh] divide-y divide-slate-100 overflow-y-auto pr-1">
            {rows.map((o) => (
              <OptionRow key={o.id} kind={kind} option={o} />
            ))}
            {!rows.length && <li className="py-6 text-center text-sm text-slate-500">Liste boş. Yukarıdan ekleyin ya da önerilen listeyi ekleyin.</li>}
          </ul>
        )}
      </div>
    </Modal>
  );
}
