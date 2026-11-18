import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';

/** Menü › Güvenlik: iki adımlı doğrulama durumu ve açık oturumlar */
export interface SecurityInfo {
  mfa: { enabled: boolean; required: boolean; enabledAt: string | null; recoveryLeft: number };
  sessions: { id: string; device: string; lastUsedAt: string; current: boolean }[];
}
export const SECURITY_KEY = ['me-security'];
export const useSecurity = () => useQuery({ queryKey: SECURITY_KEY, queryFn: () => api<SecurityInfo>('/api/me/security') });
