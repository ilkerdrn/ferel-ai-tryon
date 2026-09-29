# Ferel AI Try-On

Ticimax ürün detay sayfasına **AI ile dene** özelliği ekleyen MVP.

## Mimari

Ticimax -> Vercel/Next.js backend -> fal.ai Virtual Try-On -> sonuç -> Ticimax popup

API anahtarı tarayıcıya gönderilmez.

## 1. fal.ai

1. fal.ai hesabı oluştur.
2. Billing/Credits bölümünden kredi ekle.
3. API key oluştur.
4. API key'i yalnızca Vercel environment variable olarak sakla.

Varsayılan model:

`fal-ai/image-apps-v2/virtual-try-on`

Gerekli fal girdileri:
- `person_image_url`
- `clothing_image_url`
- `preserve_pose`

## 2. Lokal kurulum

Node.js 20+ önerilir.

```bash
npm install
```

`.env.example` dosyasını `.env.local` olarak kopyala:

```env
FAL_KEY=xxxx
ALLOWED_ORIGINS=https://ferellmoda.com,https://www.ferellmoda.com
FAL_MODEL=fal-ai/image-apps-v2/virtual-try-on
```

Çalıştır:

```bash
npm run dev
```

## 3. Vercel deploy

### Kolay yöntem

1. Bu klasörü GitHub'a yükle.
2. Vercel -> Add New -> Project.
3. GitHub reposunu seç.
4. Environment Variables:
   - `FAL_KEY`
   - `ALLOWED_ORIGINS`
   - `FAL_MODEL`
5. Deploy.

Örnek URL:

`https://ferel-ai-tryon.vercel.app`

## 4. Ticimax bağlantısı

`ticimax/ferel-ai-tryon.html` dosyasını aç.

Şunu:

```js
const API_BASE = "https://YOUR-PROJECT.vercel.app";
```

Vercel URL'inle değiştir:

```js
const API_BASE = "https://ferel-ai-tryon.vercel.app";
```

Sonra kodu ürün detay sayfasında çalışan Ticimax özel JS/HTML alanına ekle.

## 5. Test

1. Bir ürün detay sayfasını aç.
2. `AI ile dene` butonu görünmeli.
3. Fotoğraf yükle.
4. `Denemeyi Başlat`.
5. Sonuç popup içinde görünmeli.

## Güvenlik

- `FAL_KEY` frontend'e konulmaz.
- Sadece `ALLOWED_ORIGINS` içindeki domainlerden tarayıcı istekleri kabul edilir.
- Müşteri görseli backend üzerinden fal depolamasına yüklenir.
- Ürün görseli mağaza URL'sinden backend tarafından indirilip fal storage'a tekrar yüklenir.
- Fotoğraf frontend'de 1280px JPEG'e sıkıştırılır.

## Canlıya geçmeden önce yapılacaklar

MVP çalıştıktan sonra bunları eklemek önerilir:

- KVKK açık rıza / aydınlatma akışı
- Kalıcı rate limit (Upstash Redis veya Supabase)
- IP / session başına günlük deneme limiti
- abuse/bot koruması
- maliyet limiti ve alarmı
- sonuç/log saklama politikasının netleştirilmesi
- "Sepete Ekle" entegrasyonu
- analitik: ürün, deneme, sonuç, sepete dönüşüm

## fal.ai referans

Model:
https://fal.ai/models/fal-ai/image-apps-v2/virtual-try-on/api

Vercel deployment trigger
