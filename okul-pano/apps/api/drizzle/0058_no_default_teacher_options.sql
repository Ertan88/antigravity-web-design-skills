-- Varsayılan branş ve görev listesi kaldırıldı: daha önce kendiliğinden eklenen ve hiçbir öğretmene (ya da işletme
-- alanına) atanmamış öneriler silinir. Okulun elle eklediği ya da kullandığı adlar kalır.
DELETE FROM "teacher_branches" b
WHERE b."name" IN ('Almanca','Beden Eğitimi ve Spor','Bilişim Teknolojileri','Biyoloji','Coğrafya','Din Kültürü ve Ahlak Bilgisi','Felsefe','Fen Bilimleri','Fizik','Görsel Sanatlar','İngilizce','Kimya','Matematik','Müzik','Okul Öncesi','Özel Eğitim','Rehberlik ve Psikolojik Danışmanlık','Sınıf Öğretmenliği','Sosyal Bilgiler','Tarih','Teknoloji ve Tasarım','Türk Dili ve Edebiyatı','Türkçe')
  AND NOT EXISTS (SELECT 1 FROM "teachers" t WHERE t."branch_id" = b."id")
  AND NOT EXISTS (SELECT 1 FROM "businesses" x WHERE x."area_id" = b."id");--> statement-breakpoint
DELETE FROM "teacher_titles" g
WHERE g."name" IN ('Öğretmen','Uzman Öğretmen','Başöğretmen','Aday Öğretmen','Sözleşmeli Öğretmen','Ücretli Öğretmen','Okul Müdürü','Müdür Başyardımcısı','Müdür Yardımcısı')
  AND NOT EXISTS (SELECT 1 FROM "teachers" t WHERE t."title_id" = g."id");
