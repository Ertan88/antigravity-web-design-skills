import { useCallback, useState } from 'react';
import type { ZodType } from 'zod';
import { ApiError } from './api.ts';

type Errors = Record<string, string | undefined>;

/**
 * Küçük form durumu yardımcısı. Gönderimden önce API ile aynı paylaşılan Zod şemasıyla
 * doğrular; sunucudan gelen alan hatalarını da ilgili alanın altına yerleştirir.
 */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Errors>({});

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key as string] || e._form ? { ...e, [key as string]: undefined, _form: undefined } : e));
  }, []);

  const reset = useCallback((next: T) => {
    setValues(next);
    setErrors({});
  }, []);

  const validate = useCallback(<S extends ZodType>(schema: S, payload: unknown) => {
    const result = schema.safeParse(payload);
    if (result.success) return result.data as S['_output'];
    const next: Errors = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '_form');
      next[key] ??= issue.message;
    }
    setErrors(next);
    return null;
  }, []);

  const fail = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.issues.length) {
      const next: Errors = {};
      for (const i of err.issues) next[i.path.split('.')[0] || '_form'] ??= i.message;
      setErrors(next);
    } else {
      setErrors({ _form: err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.' });
    }
  }, []);

  return { values, errors, set, reset, validate, fail, setErrors };
}
