package com.okulpano.core

/** Acil durum türleri (AFAD / MEB yönergelerinin kısa hâli; packages/shared/src/emergency.ts ile aynı) */
data class EmergencyInfo(val type: String, val title: String, val label: String)

val EMERGENCY_TYPES = listOf(
  EmergencyInfo("earthquake", "DEPREM", "Deprem"),
  EmergencyInfo("fire", "YANGIN", "Yangın"),
  EmergencyInfo("evacuation", "TAHLİYE", "Tahliye"),
  EmergencyInfo("lockdown", "GÜVENLİK UYARISI", "Güvenlik / kilitlenme"),
  EmergencyInfo("custom", "ACİL DURUM", "Diğer"),
)

fun emergencyLabel(type: String) = EMERGENCY_TYPES.firstOrNull { it.type == type }?.label ?: "Acil durum"
