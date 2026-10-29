/**
 * Ekranların kaydırma konumu (ekran yolu → konum). Tema değişince ekranlar yeniden kurulur; o andaki konumlar
 * scrollRestore'a alınır ve ekranlar açılırken oraya kaydırılır (bkz. themeMode.tsx, Screen).
 */
export const scrollMemory = new Map<string, number>();
export const scrollRestore = new Set<string>();
