/**
 * Acil durum modu: tek tuşla bütün panolarda tam ekran kırmızı uyarı.
 * Talimatlar AFAD / MEB acil durum yönergelerinin kısa hâlidir; panelden ek mesaj yazılabilir.
 */
export const EMERGENCY_TYPES = ['earthquake', 'fire', 'evacuation', 'lockdown', 'custom'] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

export const EMERGENCY_INFO: Record<EmergencyType, { title: string; label: string; instructions: string[] }> = {
  earthquake: {
    title: 'DEPREM',
    label: 'Deprem',
    instructions: ['ÇÖK – KAPAN – TUTUN', 'Sarsıntı bitene kadar yerinizde kalın', 'Pencerelerden ve camlardan uzak durun', 'Sarsıntı bitince öğretmeninizle toplanma alanına gidin'],
  },
  fire: {
    title: 'YANGIN',
    label: 'Yangın',
    instructions: ['Sakin olun, koşmayın', 'En yakın acil çıkışı kullanın', 'Asansörü kullanmayın', 'Duman varsa eğilerek ilerleyin'],
  },
  evacuation: {
    title: 'TAHLİYE',
    label: 'Tahliye',
    instructions: ['Eşyalarınızı bırakın', 'Öğretmeninizin yönlendirmesiyle sırayla binayı terk edin', 'Toplanma alanında sınıfınızla bekleyin'],
  },
  lockdown: {
    title: 'GÜVENLİK UYARISI',
    label: 'Güvenlik / kilitlenme',
    instructions: ['Sınıflarda kalın', 'Kapıları kapatın ve kilitleyin', 'Pencerelerden uzak durun', 'İkinci bir duyuruya kadar dışarı çıkmayın'],
  },
  custom: {
    title: 'ACİL DURUM',
    label: 'Diğer',
    instructions: ['Öğretmenlerinizin ve görevlilerin yönlendirmelerine uyun'],
  },
};

/** Panoya giden acil durum bilgisi */
export interface DisplayEmergency {
  type: EmergencyType;
  message: string | null;
  sound: boolean;
  startedAt: string;
}
