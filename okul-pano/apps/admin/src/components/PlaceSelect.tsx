import { districtsOf, isProvince, PROVINCES } from '@okulpano/shared';
import { Field, Select } from './ui.tsx';

/**
 * İl ve ilçe: hazır listeden seçilir (elle yazım yok). İl seçilmeden ilçe kapalıdır; il değişince ilçe temizlenir.
 * Eski kayıtlarda listede olmayan bir değer yazılıysa kaybolmasın diye seçenek olarak gösterilir.
 */
export function PlaceSelect({
  province,
  district,
  onChange,
  required,
  provinceHelp,
  districtHelp,
}: {
  province: string;
  district: string;
  onChange: (province: string, district: string) => void;
  required?: boolean;
  provinceHelp?: string;
  districtHelp?: string;
}) {
  const districts = districtsOf(province);
  const oldProvince = province && !isProvince(province);
  const oldDistrict = district && !districts.includes(district);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="İl" help={provinceHelp}>
        {(id) => (
          <Select id={id} required={required} value={province} onChange={(e) => onChange(e.target.value, '')}>
            <option value="" disabled={required}>
              İl seçin
            </option>
            {oldProvince && <option value={province}>{province}</option>}
            {PROVINCES.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="İlçe" help={districtHelp}>
        {(id) => (
          <Select id={id} required={required} disabled={!province} value={district} onChange={(e) => onChange(province, e.target.value)}>
            <option value="" disabled={required}>
              {province ? 'İlçe seçin' : 'Önce il seçin'}
            </option>
            {oldDistrict && <option value={district}>{district}</option>}
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}
