import type { WeatherIcon } from '@okulpano/shared/client';
import type { ReactNode, SVGProps } from 'react';

/* Emoji fontu olmayan cihazlarda (ör. Raspberry Pi) da aynı görünmesi için çizgi simgeler satır içi SVG. */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(children: ReactNode) {
  return function Icon({ size = 24, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {children}
      </svg>
    );
  };
}

const cloudBase = 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242';

export const SunIcon = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </>,
);
export const MoonIcon = make(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);
export const CloudIcon = make(<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />);
export const CloudSunIcon = make(
  <>
    <path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.947 12.65a4 4 0 0 0-5.925-4.128" />
    <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
  </>,
);
export const CloudMoonIcon = make(
  <>
    <path d="M10.188 8.5A6 6 0 0 1 16 4a1 1 0 0 0 6 6 6 6 0 0 1-3 5.197" />
    <path d="M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z" />
  </>,
);
export const FogIcon = make(
  <>
    <path d={cloudBase} />
    <path d="M16 17H7M17 21H9" />
  </>,
);
export const DrizzleIcon = make(
  <>
    <path d={cloudBase} />
    <path d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1" />
  </>,
);
export const RainIcon = make(
  <>
    <path d={cloudBase} />
    <path d="M16 14v6M8 14v6M12 16v6" />
  </>,
);
export const SnowIcon = make(
  <>
    <path d={cloudBase} />
    <path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01" />
  </>,
);
export const StormIcon = make(
  <>
    <path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" />
    <path d="m13 12-3 5h4l-3 5" />
  </>,
);

export const WEATHER_ICONS: Record<WeatherIcon, ReturnType<typeof make>> = {
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

export const CapIcon = make(
  <>
    <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
    <path d="M22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
  </>,
);
export const ShieldIcon = make(
  <>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const UserMinusIcon = make(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 11h-6" />
  </>,
);
export const CakeIcon = make(
  <>
    <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
    <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01" />
  </>,
);
/** Yumuşak hatlı kum saati (köşeler ve boğaz yuvarlatılmış) */
export const HourglassIcon = make(
  <>
    <rect x="4.5" y="1.5" width="15" height="2" rx="1" />
    <rect x="4.5" y="20.5" width="15" height="2" rx="1" />
    <path d="M7 3.5v2.2c0 2.6 3.6 4.4 3.6 6.3S7 15.7 7 18.3v2.2" />
    <path d="M17 3.5v2.2c0 2.6-3.6 4.4-3.6 6.3s3.6 3.7 3.6 6.3v2.2" />
    <path d="M9.2 19.6c.4-1.4 1.6-2.3 2.8-2.6 1.2.3 2.4 1.2 2.8 2.6z" opacity="0.6" />
  </>,
);
export const BellIcon = make(
  <>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </>,
);
/** Filigran için zil: içteki çan yuvarlağı çok silik */
export const BellWatermarkIcon = make(
  <>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" opacity="0.25" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </>,
);
export const BookIcon = make(
  <>
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </>,
);
export const MegaphoneIcon = make(
  <>
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </>,
);
export const WifiOffIcon = make(
  <path d="M12 20h.01M8.5 16.429a5 5 0 0 1 7 0M5 12.859a10 10 0 0 1 5.17-2.69M19 12.859a10 10 0 0 0-2.007-1.523M2 8.82a15 15 0 0 1 4.177-2.643M22 8.82a15 15 0 0 0-11.288-3.764M2 2l20 20" />,
);
export const SchoolIcon = make(
  <>
    <path d="M14 22v-4a2 2 0 1 0-4 0v4" />
    <path d="m18 10 3.447 1.724a1 1 0 0 1 .553.894V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7.382a1 1 0 0 1 .553-.894L6 10" />
    <path d="M18 5v17M4 6l8-4 8 4M6 5v17" />
    <circle cx="12" cy="9" r="2" />
  </>,
);
export const CoffeeIcon = make(
  <path d="M10 2v2M14 2v2M6 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />,
);
export const UtensilsIcon = make(
  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />,
);
export const MonitorIcon = make(
  <>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </>,
);
