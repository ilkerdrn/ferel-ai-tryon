import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PERSON_BYTES = 4 * 1024 * 1024;
const MAX_PRODUCT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigins();

  const allowOrigin =
    allowed.length === 0
      ? origin || "*"
      : allowed.includes(origin)
        ? origin
        : "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function isOriginAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowed = allowedOrigins();
  if (allowed.length === 0) return true;

  return allowed.includes(origin);
}

export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request)
  });
}

async function responseJson(request, payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: corsHeaders(request)
  });
}

async function fetchProductImageAsFile(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Geçersiz ürün görseli URL'si.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Ürün görseli sadece http/https olabilir.");
  }

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 Ferel-AI-TryOn/1.0",
      "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`Ürün görseli indirilemedi (${response.status}).`);
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!ALLOWED_MIME.has(contentType)) {
    throw new Error(`Desteklenmeyen ürün görseli türü: ${contentType || "bilinmiyor"}`);
  }

  const blob = await response.blob();

  if (blob.size > MAX_PRODUCT_BYTES) {
    throw new Error("Ürün görseli çok büyük.");
  }

  const ext =
    contentType === "image/png" ? "png" :
    contentType === "image/webp" ? "webp" : "jpg";

  return new File([blob], `product.${ext}`, { type: contentType });
}

export async function POST(request) {
  try {
    if (!process.env.FAL_KEY) {
      return responseJson(
        request,
        { ok: false, error: "Sunucuda FAL_KEY tanımlı değil." },
        500
      );
    }

    if (!isOriginAllowed(request)) {
      return responseJson(
        request,
        { ok: false, error: "Bu domain bu API'yi kullanmaya yetkili değil." },
        403
      );
    }

    const form = await request.formData();

    const personImage = form.get("personImage");
    const productImageUrl = String(form.get("productImageUrl") || "").trim();
    const productCode = String(form.get("productCode") || "").trim();
    const productName = String(form.get("productName") || "").trim();

    if (!(personImage instanceof File)) {
      return responseJson(
        request,
        { ok: false, error: "Müşteri fotoğrafı eksik." },
        400
      );
    }

    if (!ALLOWED_MIME.has(personImage.type)) {
      return responseJson(
        request,
        { ok: false, error: "Fotoğraf JPG, PNG veya WEBP olmalı." },
        400
      );
    }

    if (personImage.size > MAX_PERSON_BYTES) {
      return responseJson(
        request,
        { ok: false, error: "Fotoğraf 4 MB'dan küçük olmalı." },
        413
      );
    }

    if (!productImageUrl) {
      return responseJson(
        request,
        { ok: false, error: "Ürün görseli bulunamadı." },
        400
      );
    }

    fal.config({ credentials: process.env.FAL_KEY });

    const productFile = await fetchProductImageAsFile(productImageUrl);

    const [personUrl, clothingUrl] = await Promise.all([
      fal.storage.upload(personImage),
      fal.storage.upload(productFile)
    ]);

    const model =
      process.env.FAL_MODEL ||
      "fal-ai/image-apps-v2/virtual-try-on";

    const result = await fal.subscribe(model, {
      input: {
        person_image_url: personUrl,
        clothing_image_url: clothingUrl,
        preserve_pose: true
      },
      logs: false
    });

    const imageUrl = result?.data?.images?.[0]?.url;

    if (!imageUrl) {
      throw new Error("AI sonucu içinde görsel URL'si bulunamadı.");
    }

    return responseJson(request, {
      ok: true,
      imageUrl,
      requestId: result.requestId || null,
      product: {
        code: productCode || null,
        name: productName || null
      }
    });
  } catch (error) {
    console.error("TRY_ON_ERROR", error);

    return responseJson(
      request,
      {
        ok: false,
        error: "AI denemesi oluşturulamadı.",
        detail:
          process.env.NODE_ENV === "development"
            ? String(error?.message || error)
            : undefined
      },
      500
    );
  }
}
