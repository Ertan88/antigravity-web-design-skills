import type { Permission } from '@okulpano/shared';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ZodType } from 'zod';
import { useAuth } from '../lib/auth.tsx';
import { useList, useResource } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';
import { Alert, Button, Card, DeleteButton, EmptyState, IconButton, Modal, PageHeader, Spinner, Table, Td, Toggle } from './ui.tsx';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export type FormApi<F extends Record<string, unknown>> = ReturnType<typeof useForm<F>>;

export interface CrudPageProps<T extends { id: string }, F extends Record<string, unknown>> {
  resource: string;
  /** Bildirimlerde kullanılan tekil ad: "Duyuru eklendi" */
  label: string;
  title: string;
  description: ReactNode;
  permission: Permission;
  icon: ReactNode;
  emptyTitle: string;
  emptyText: string;
  addLabel: string;
  columns: Column<T>[];
  /** Listeyi süzmek/sıralamak için */
  select?: (rows: T[]) => T[];
  toolbar?: ReactNode;
  emptyForm: () => F;
  toForm: (row: T) => F;
  toPayload: (form: F) => unknown;
  schema: ZodType;
  renderForm: (form: FormApi<F>, editing: T | null) => ReactNode;
  activeToggle?: boolean;
  reorderable?: boolean;
  modalSize?: 'md' | 'lg' | 'xl';
  rowActions?: (row: T) => ReactNode;
  headerActions?: ReactNode;
  /** Başlığın altında sekmeler (ör. Nöbet yerleri / Müdür yardımcısı) */
  tabs?: ReactNode;
  /** Verilirse liste kartının yerine gösterilir ve "ekle" düğmesi gizlenir (başka sekme açıkken) */
  replaceContent?: ReactNode;
}

/**
 * Basit içerik türleri için ortak liste + düzenleme sayfası. Kayan yazı, sınavlar, öğretmenler,
 * sınıflar, izinler, öğrenciler ve nöbet bu bileşenle aynı davranışı paylaşır.
 */
export function CrudPage<T extends { id: string; isActive?: boolean }, F extends Record<string, unknown>>(p: CrudPageProps<T, F>) {
  const { can } = useAuth();
  const editable = can(p.permission);
  const list = useList<T>(p.resource);
  const ops = useResource<T>(p.resource, p.label);
  const form = useForm<F>(p.emptyForm());
  const [editing, setEditing] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  const rows = p.select ? p.select(list.data ?? []) : (list.data ?? []);
  const [params, setParams] = useSearchParams();

  const openNew = () => {
    setEditing(null);
    form.reset(p.emptyForm());
    setOpen(true);
  };

  // Genel bakıştaki "Duyuru ekle" gibi kısayollar: ?yeni=1 ile form doğrudan açılır
  useEffect(() => {
    if (params.get('yeni') && editable) {
      openNew();
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openEdit = (row: T) => {
    setEditing(row);
    form.reset(p.toForm(row));
    setOpen(true);
  };

  const submit = async () => {
    const payload = form.validate(p.schema, p.toPayload(form.values));
    if (!payload) return;
    try {
      if (editing) await ops.update.mutateAsync({ id: editing.id, body: payload });
      else await ops.create.mutateAsync(payload);
      setOpen(false);
    } catch (err) {
      form.fail(err);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    ops.reorder.mutate(ids);
  };

  const saving = ops.create.isPending || ops.update.isPending;

  const toggle = (row: T) => (
    <Toggle checked={Boolean(row.isActive)} disabled={!editable} onChange={(v) => ops.patch.mutate({ id: row.id, body: { isActive: v } })} />
  );

  const actions = (row: T, i: number) => (
    <div className="flex items-center justify-end gap-0.5">
      {p.rowActions?.(row)}
      {editable && p.reorderable && (
        <>
          <IconButton label="Yukarı taşı" disabled={i === 0} onClick={() => move(i, -1)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label="Aşağı taşı" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
            <ArrowDown className="size-4" />
          </IconButton>
        </>
      )}
      {editable && (
        <>
          <IconButton label="Düzenle" onClick={() => openEdit(row)}>
            <Pencil className="size-4" />
          </IconButton>
          <DeleteButton onConfirm={() => ops.remove.mutate(row.id)} />
        </>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={p.title}
        description={p.description}
        actions={
          <>
            {p.headerActions}
            {editable && !p.replaceContent && (
              <Button icon={<Plus className="size-4" />} onClick={openNew}>
                {p.addLabel}
              </Button>
            )}
          </>
        }
      />

      {p.tabs && <div className="mb-4">{p.tabs}</div>}

      {!editable && (
        <div className="mb-4">
          <Alert tone="blue">Bu bölümü görüntüleyebilirsiniz; değişiklik yapma yetkiniz yok.</Alert>
        </div>
      )}

      {p.replaceContent ?? (
      <Card>
        {p.toolbar && <div className="border-b border-slate-100 px-5 py-3">{p.toolbar}</div>}
        {list.isLoading ? (
          <Spinner />
        ) : list.isError ? (
          <div className="p-5">
            <Alert tone="red">{list.error.message}</Alert>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={p.icon}
            title={p.emptyTitle}
            description={p.emptyText}
            action={
              editable && (
                <Button icon={<Plus className="size-4" />} onClick={openNew}>
                  {p.addLabel}
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Masaüstü: tablo */}
            <div className="hidden md:block">
              <Table head={[...p.columns.map((c) => c.header), ...(p.activeToggle ? ['Yayında'] : []), '']}>
                {rows.map((row, i) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    {p.columns.map((c, ci) => (
                      <Td key={ci} className={c.className}>
                        {c.cell(row)}
                      </Td>
                    ))}
                    {p.activeToggle && <Td>{toggle(row)}</Td>}
                    <Td className="w-px whitespace-nowrap text-right">{actions(row, i)}</Td>
                  </tr>
                ))}
              </Table>
            </div>
            {/* Telefon: kart listesi */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((row, i) => {
                const [main, ...rest] = p.columns;
                return (
                  <li key={row.id} className="space-y-3 px-4 py-4">
                    {main && <div>{main.cell(row)}</div>}
                    {rest.length > 0 && (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                        {rest.map((c, ci) => (
                          <Fragment key={ci}>
                            <dt className="text-xs font-medium text-slate-400 uppercase">{c.header}</dt>
                            <dd className="min-w-0">{c.cell(row)}</dd>
                          </Fragment>
                        ))}
                      </dl>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      {p.activeToggle ? toggle(row) : <span />}
                      {actions(row, i)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `${p.label} düzenle` : p.addLabel}
        size={p.modalSize}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              Kaydet
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
          {p.renderForm(form, editing)}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </>
  );
}
