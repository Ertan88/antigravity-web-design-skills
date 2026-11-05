import type { WeatherIcon } from '@okulpano/shared/client';
import * as T from '@tabler/icons-react';
import type { ComponentType, SVGProps } from 'react';

/*
 * Panodaki bütün simgeler: Tabler Icons (MIT), panel ve mobil uygulamayla aynı set. SVG olarak paketin içinde
 * gelir; emoji fontu ya da internet gerekmez (ör. Raspberry Pi).
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref' | 'stroke'> & { size?: number; strokeWidth?: number | string };
type PanoIcon = ComponentType<IconProps>;

function make(Comp: T.Icon): PanoIcon {
  return function Icon({ size = 24, strokeWidth = 1.8, ...rest }: IconProps) {
    return <Comp size={size} stroke={strokeWidth} aria-hidden="true" {...(rest as object)} />;
  };
}

export const SunIcon = make(T.IconSun);
export const MoonIcon = make(T.IconMoon);
export const CloudIcon = make(T.IconCloud);
export const CloudSunIcon = make(T.IconHaze);
export const CloudMoonIcon = make(T.IconHazeMoon);
export const FogIcon = make(T.IconMist);
export const DrizzleIcon = make(T.IconDroplets);
export const RainIcon = make(T.IconCloudRain);
export const SnowIcon = make(T.IconSnowflake);
export const StormIcon = make(T.IconCloudStorm);

export const WEATHER_ICONS: Record<WeatherIcon, PanoIcon> = {
  sun: SunIcon,
  moon: MoonIcon,
  'cloud-sun': CloudSunIcon,
  'cloud-moon': CloudMoonIcon,
  cloud: CloudIcon,
  fog: FogIcon,
  drizzle: DrizzleIcon,
  rain: RainIcon,
  snow: SnowIcon,
  storm: StormIcon,
};

export const CapIcon = make(T.IconSchool);
export const ShieldIcon = make(T.IconShieldCheck);
export const UserMinusIcon = make(T.IconUserMinus);
export const CakeIcon = make(T.IconCake);
export const HourglassIcon = make(T.IconHourglass);
export const BellIcon = make(T.IconBell);
/** Filigran için zil */
export const BellWatermarkIcon = make(T.IconBell);
export const BookIcon = make(T.IconBook);
export const MegaphoneIcon = make(T.IconSpeakerphone);
export const WifiOffIcon = make(T.IconWifiOff);
export const SchoolIcon = make(T.IconBuildingCommunity);
export const CoffeeIcon = make(T.IconCoffee);
export const UtensilsIcon = make(T.IconToolsKitchen2);
export const MonitorIcon = make(T.IconDeviceDesktop);
export const TrophyIcon = make(T.IconTrophy);
export const CalendarIcon = make(T.IconCalendar);
export const LibraryIcon = make(T.IconBooks);
export const AlertIcon = make(T.IconAlertTriangle);
export const PinIcon = make(T.IconMapPin);
export const ClipboardIcon = make(T.IconClipboardCheck);
