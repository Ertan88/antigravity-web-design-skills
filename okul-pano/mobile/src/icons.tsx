/**
 * Uygulamanın bütün simgeleri tek yerden gelir: Tabler Icons (MIT), webdeki panelle aynı set.
 * Ekranlar simgeleri kısa adlarla çağırır (ör. 'trash-outline'); ad → Tabler eşlemesi burada.
 * Her simge ayrı içe aktarılır, böylece uygulamaya yalnızca kullanılanlar girer.
 */
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import IconAlertCircle from '@tabler/icons-react-native/IconAlertCircle';
import IconAlertTriangle from '@tabler/icons-react-native/IconAlertTriangle';
import IconAlertTriangleFilled from '@tabler/icons-react-native/IconAlertTriangleFilled';
import IconArrowBackUp from '@tabler/icons-react-native/IconArrowBackUp';
import IconArrowRight from '@tabler/icons-react-native/IconArrowRight';
import IconArrowsExchange from '@tabler/icons-react-native/IconArrowsExchange';
import IconBell from '@tabler/icons-react-native/IconBell';
import IconBellFilled from '@tabler/icons-react-native/IconBellFilled';
import IconBook from '@tabler/icons-react-native/IconBook';
import IconBroadcast from '@tabler/icons-react-native/IconBroadcast';
import IconBuilding from '@tabler/icons-react-native/IconBuilding';
import IconBus from '@tabler/icons-react-native/IconBus';
import IconCalendar from '@tabler/icons-react-native/IconCalendar';
import IconCalendarEvent from '@tabler/icons-react-native/IconCalendarEvent';
import IconCalendarFilled from '@tabler/icons-react-native/IconCalendarFilled';
import IconCalendarMonth from '@tabler/icons-react-native/IconCalendarMonth';
import IconCamera from '@tabler/icons-react-native/IconCamera';
import IconChartLine from '@tabler/icons-react-native/IconChartLine';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconChecks from '@tabler/icons-react-native/IconChecks';
import IconChevronDown from '@tabler/icons-react-native/IconChevronDown';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconChevronUp from '@tabler/icons-react-native/IconChevronUp';
import IconCircleCheck from '@tabler/icons-react-native/IconCircleCheck';
import IconCircleCheckFilled from '@tabler/icons-react-native/IconCircleCheckFilled';
import IconCircleMinus from '@tabler/icons-react-native/IconCircleMinus';
import IconCirclePlus from '@tabler/icons-react-native/IconCirclePlus';
import IconClipboard from '@tabler/icons-react-native/IconClipboard';
import IconClipboardFilled from '@tabler/icons-react-native/IconClipboardFilled';
import IconClock from '@tabler/icons-react-native/IconClock';
import IconCode from '@tabler/icons-react-native/IconCode';
import IconCoffee from '@tabler/icons-react-native/IconCoffee';
import IconDeviceMobile from '@tabler/icons-react-native/IconDeviceMobile';
import IconDeviceTv from '@tabler/icons-react-native/IconDeviceTv';
import IconExternalLink from '@tabler/icons-react-native/IconExternalLink';
import IconEye from '@tabler/icons-react-native/IconEye';
import IconEyeOff from '@tabler/icons-react-native/IconEyeOff';
import IconFlower from '@tabler/icons-react-native/IconFlower';
import IconGauge from '@tabler/icons-react-native/IconGauge';
import IconGift from '@tabler/icons-react-native/IconGift';
import IconGridDots from '@tabler/icons-react-native/IconGridDots';
import IconHeart from '@tabler/icons-react-native/IconHeart';
import IconHelpCircle from '@tabler/icons-react-native/IconHelpCircle';
import IconHome from '@tabler/icons-react-native/IconHome';
import IconHomeFilled from '@tabler/icons-react-native/IconHomeFilled';
import IconHourglass from '@tabler/icons-react-native/IconHourglass';
import IconKey from '@tabler/icons-react-native/IconKey';
import IconLayoutGrid from '@tabler/icons-react-native/IconLayoutGrid';
import IconLayoutGridFilled from '@tabler/icons-react-native/IconLayoutGridFilled';
import IconLibraryPhoto from '@tabler/icons-react-native/IconLibraryPhoto';
import IconLink from '@tabler/icons-react-native/IconLink';
import IconList from '@tabler/icons-react-native/IconList';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconLogin from '@tabler/icons-react-native/IconLogin';
import IconLogout from '@tabler/icons-react-native/IconLogout';
import IconMail from '@tabler/icons-react-native/IconMail';
import IconMailFilled from '@tabler/icons-react-native/IconMailFilled';
import IconMailOpened from '@tabler/icons-react-native/IconMailOpened';
import IconMap from '@tabler/icons-react-native/IconMap';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconMenu2 from '@tabler/icons-react-native/IconMenu2';
import IconMoon from '@tabler/icons-react-native/IconMoon';
import IconPencil from '@tabler/icons-react-native/IconPencil';
import IconPhoto from '@tabler/icons-react-native/IconPhoto';
import IconPlayerPause from '@tabler/icons-react-native/IconPlayerPause';
import IconPlayerPlay from '@tabler/icons-react-native/IconPlayerPlay';
import IconPlayerPlayFilled from '@tabler/icons-react-native/IconPlayerPlayFilled';
import IconPlayerSkipBack from '@tabler/icons-react-native/IconPlayerSkipBack';
import IconPlayerSkipForward from '@tabler/icons-react-native/IconPlayerSkipForward';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconPower from '@tabler/icons-react-native/IconPower';
import IconQrcode from '@tabler/icons-react-native/IconQrcode';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconSchool from '@tabler/icons-react-native/IconSchool';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconSend from '@tabler/icons-react-native/IconSend';
import IconShare from '@tabler/icons-react-native/IconShare';
import IconShield from '@tabler/icons-react-native/IconShield';
import IconShieldCheck from '@tabler/icons-react-native/IconShieldCheck';
import IconSpeakerphone from '@tabler/icons-react-native/IconSpeakerphone';
import IconSquareCheck from '@tabler/icons-react-native/IconSquareCheck';
import IconSquareCheckFilled from '@tabler/icons-react-native/IconSquareCheckFilled';
import IconStack2 from '@tabler/icons-react-native/IconStack2';
import IconStar from '@tabler/icons-react-native/IconStar';
import IconStarFilled from '@tabler/icons-react-native/IconStarFilled';
import IconSun from '@tabler/icons-react-native/IconSun';
import IconToolsKitchen2 from '@tabler/icons-react-native/IconToolsKitchen2';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import IconTrophy from '@tabler/icons-react-native/IconTrophy';
import IconTypography from '@tabler/icons-react-native/IconTypography';
import IconUser from '@tabler/icons-react-native/IconUser';
import IconUserCircle from '@tabler/icons-react-native/IconUserCircle';
import IconUserFilled from '@tabler/icons-react-native/IconUserFilled';
import IconUserPlus from '@tabler/icons-react-native/IconUserPlus';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconUsersGroup from '@tabler/icons-react-native/IconUsersGroup';
import IconX from '@tabler/icons-react-native/IconX';

export type TablerIcon = ComponentType<SvgProps & { size?: number | string; strokeWidth?: number | string; color?: string }>;

export const ICONS = {
  'add': IconPlus,
  'add-circle-outline': IconCirclePlus,
  'albums-outline': IconStack2,
  'alert-circle-outline': IconAlertCircle,
  'analytics-outline': IconChartLine,
  'arrow-forward': IconArrowRight,
  'arrow-undo-outline': IconArrowBackUp,
  'body': IconUser,
  'book-outline': IconBook,
  'bus-outline': IconBus,
  'business': IconBuilding,
  'business-outline': IconBuilding,
  'cafe-outline': IconCoffee,
  'calendar': IconCalendarFilled,
  'calendar-outline': IconCalendar,
  'calendar-clear': IconCalendarEvent,
  'calendar-clear-outline': IconCalendarEvent,
  'calendar-number-outline': IconCalendarMonth,
  'camera-outline': IconCamera,
  'checkbox': IconSquareCheckFilled,
  'checkbox-outline': IconSquareCheck,
  'checkmark': IconCheck,
  'checkmark-circle': IconCircleCheckFilled,
  'checkmark-circle-outline': IconCircleCheck,
  'checkmark-done': IconChecks,
  'checkmark-done-outline': IconChecks,
  'chevron-back': IconChevronLeft,
  'chevron-down': IconChevronDown,
  'chevron-forward': IconChevronRight,
  'chevron-up': IconChevronUp,
  'clipboard': IconClipboardFilled,
  'clipboard-outline': IconClipboard,
  'close': IconX,
  'code': IconCode,
  'create': IconPencil,
  'create-outline': IconPencil,
  'enter-outline': IconLogin,
  'eye-off-outline': IconEyeOff,
  'eye-outline': IconEye,
  'gift-outline': IconGift,
  'grid': IconLayoutGridFilled,
  'grid-outline': IconLayoutGrid,
  'heart-outline': IconHeart,
  'help-circle-outline': IconHelpCircle,
  'home': IconHomeFilled,
  'home-outline': IconHome,
  'hourglass-outline': IconHourglass,
  'image': IconPhoto,
  'image-outline': IconPhoto,
  'images': IconLibraryPhoto,
  'images-outline': IconLibraryPhoto,
  'key-outline': IconKey,
  'keypad-outline': IconGridDots,
  'link': IconLink,
  'list': IconList,
  'location-outline': IconMapPin,
  'lock-closed-outline': IconLock,
  'log-out-outline': IconLogout,
  'mail': IconMailFilled,
  'mail-outline': IconMail,
  'mail-open-outline': IconMailOpened,
  'map': IconMap,
  'megaphone': IconSpeakerphone,
  'megaphone-outline': IconSpeakerphone,
  'moon-outline': IconMoon,
  'notifications': IconBellFilled,
  'notifications-outline': IconBell,
  'open': IconExternalLink,
  'partly-sunny': IconSun,
  'pause': IconPlayerPause,
  'pause-circle-outline': IconPlayerPause,
  'people': IconUsersGroup,
  'people-outline': IconUsers,
  'person': IconUserFilled,
  'person-outline': IconUser,
  'person-add-outline': IconUserPlus,
  'person-circle-outline': IconUserCircle,
  'phone-portrait-outline': IconDeviceMobile,
  'play': IconPlayerPlayFilled,
  'play-circle-outline': IconPlayerPlay,
  'play-skip-back': IconPlayerSkipBack,
  'play-skip-forward': IconPlayerSkipForward,
  'power-outline': IconPower,
  'qr-code-outline': IconQrcode,
  'radio': IconBroadcast,
  'radio-outline': IconBroadcast,
  'refresh': IconRefresh,
  'reload': IconRefresh,
  'remove-circle-outline': IconCircleMinus,
  'reorder-three-outline': IconMenu2,
  'restaurant-outline': IconToolsKitchen2,
  'rose': IconFlower,
  'school': IconSchool,
  'school-outline': IconSchool,
  'search': IconSearch,
  'send': IconSend,
  'send-outline': IconSend,
  'share-outline': IconShare,
  'shield-checkmark': IconShieldCheck,
  'shield-checkmark-outline': IconShieldCheck,
  'shield-outline': IconShield,
  'speedometer-outline': IconGauge,
  'star': IconStarFilled,
  'star-outline': IconStar,
  'sunny': IconSun,
  'sunny-outline': IconSun,
  'swap-horizontal-outline': IconArrowsExchange,
  'text': IconTypography,
  'time': IconClock,
  'time-outline': IconClock,
  'today': IconCalendarEvent,
  'trash-outline': IconTrash,
  'trophy-outline': IconTrophy,
  'tv': IconDeviceTv,
  'tv-outline': IconDeviceTv,
  'warning': IconAlertTriangleFilled,
  'warning-outline': IconAlertTriangle,
} satisfies Record<string, TablerIcon>;

export type IconName = keyof typeof ICONS;
