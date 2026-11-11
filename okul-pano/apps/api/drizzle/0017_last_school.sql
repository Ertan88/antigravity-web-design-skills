-- Kullanıcının en son açtığı okul: yeni cihazda (ör. mobil uygulama) giriş yapınca aynı okul açılır
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_school_id" uuid REFERENCES "schools"("id") ON DELETE SET NULL;
