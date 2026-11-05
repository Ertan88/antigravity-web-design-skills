import { describe, expect, it } from 'vitest';
import { examRoles, examScheduleSchema, examTiming, zonedInstant } from './examSchedule.ts';

const day = [
  { no: 1, start: '08:30', end: '09:10' },
  { no: 2, start: '09:20', end: '10:00' },
  { no: 3, start: '10:10', end: '10:50' },
  { no: 4, start: '11:00', end: '11:40' },
  { no: 5, start: '12:30', end: '13:10' },
];

describe('examTiming', () => {
  it('1. ders: ilk zilden 15 dk önce', () => {
    expect(examTiming(day, 1)).toEqual({ start: '08:30', end: '09:10', notifyAt: '08:15', notifyKind: 'first' });
  });
  it('ara dersler: önceki teneffüsün başı', () => {
    expect(examTiming(day, 3)).toMatchObject({ start: '10:10', notifyAt: '10:00', notifyKind: 'break' });
  });
  it('öğle arasından sonraki ders: öğle arasının başı', () => {
    expect(examTiming(day, 5)).toMatchObject({ start: '12:30', notifyAt: '11:40', notifyKind: 'lunch' });
  });
  it('o gün olmayan ders saati: null', () => {
    expect(examTiming(day, 8)).toBeNull();
  });
  it('ilk ders 1 değilse (öğlenci) en erken ders "ilk" sayılır', () => {
    expect(examTiming(day.slice(2), 3)?.notifyKind).toBe('first');
  });
});

describe('zonedInstant', () => {
  it('İstanbul (UTC+3)', () => {
    expect(zonedInstant('2026-11-18', '10:00', 'Europe/Istanbul').toISOString()).toBe('2026-11-18T07:00:00.000Z');
  });
  it('yaz saati olan bölge', () => {
    expect(zonedInstant('2026-07-01', '09:00', 'Europe/Berlin').toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(zonedInstant('2026-12-01', '09:00', 'Europe/Berlin').toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });
});

describe('examRoles', () => {
  const exam = { proctors: [{ teacherId: 'a', fullName: 'A', onLeave: false, manual: false }, { teacherId: 'b', fullName: 'B', onLeave: true, manual: false }], subjectTeachers: [{ teacherId: 'a', fullName: 'A' }, { teacherId: 'c', fullName: 'C' }] };
  it('gözetmen, ders öğretmeni ya da ikisi', () => {
    expect(examRoles(exam, 'a')).toEqual({ proctor: true, subject: true });
    expect(examRoles(exam, 'c')).toEqual({ proctor: false, subject: true });
    expect(examRoles(exam, 'b')).toEqual({ proctor: false, subject: false });
    expect(examRoles(exam, null)).toEqual({ proctor: false, subject: false });
  });
});

describe('examScheduleSchema', () => {
  it('ders saati sayıya çevrilir, tür varsayılanı yazılı', () => {
    const r = examScheduleSchema.parse({ date: '2026-11-18', periodNo: '3', classGroupId: '0d3f3c8e-1c7a-4c35-9f43-1d0f8d7b5a11', subject: ' Matematik ' });
    expect(r).toMatchObject({ periodNo: 3, subject: 'Matematik', kind: 'written' });
  });
});
