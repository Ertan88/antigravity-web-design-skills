import { labelOf, type LabelKey, type Labels } from '@okulpano/shared/client';
import { createContext, useContext } from 'react';

/** Okulun kendi adlandırdığı kart başlıkları (Panel › Başlıklar); verilmeyen başlık varsayılanı kullanır */
export const LabelsContext = createContext<Labels | undefined>(undefined);

export const useLabel = (key: LabelKey, fallback?: string) => labelOf(useContext(LabelsContext), key, fallback);
