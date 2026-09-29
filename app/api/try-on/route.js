import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PERSON_BYTES =
  4 * 1024 * 1024;

const MAX_PRODUCT_BYTES =
  10 * 1024 * 1024;

const ALLOWED_MIME =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

const ALLOWED_CATEGORIES =
  new Set([
    "tops",
    "bottoms",
    "one-pieces",
    "auto"
  ]);

function allowedOrigins() {

  return (
    process.env.ALLOWED_ORIGINS || ""
  )
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function corsHeaders(request) {

  const origin =
    request.headers.get("origin") || "";

  const allowed =
    allowedOrigins();

  const allowOrigin =
    allowed.length === 0
      ? origin || "*"
      : allowed.includes(origin)
        ? origin
        : "";

  return {
    "Access-Control-Allow-Origin":
      allowOrigin,

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Vary":
      "Origin",

    "Cache-Control":
      "no-store"
  };
}

function isOriginAllowed(request) {

  const origin =
    request.headers.get("origin");

  if(!origin){
    return true;
  }

  const allowed =
    allowedOrigins();

  if(allowed.length === 0){
    return true;
  }

  return allowed.includes(origin);
}

export async function OPTIONS(request) {

  return new NextResponse(
    null,
    {
      status:204,
      headers:corsHeaders(request)
    }
  );
}

function responseJson(
  request,
  payload,
  status = 200
){

  return NextResponse.json(
    payload,
    {
      status,
      headers:corsHeaders(request)
    }
  );
}

async function fetchProductImageAsFile(url){

  let parsed;

  try{

    parsed =
      new URL(url);

  }catch{

    throw new Error(
      "Geçersiz ürün görseli URL'si."
    );
  }

  if(
    ![
      "http:",
      "https:"
    ].includes(parsed.protocol)
  ){

    throw new Error(
      "Ürün görseli yalnızca HTTP/HTTPS olabilir."
    );
  }

  const response =
    await fetch(
      url,
      {
        redirect:"follow",
        headers:{
          "User-Agent":
            "Mozilla/5.0 QUQA-AI-TryOn/1.0",

          "Accept":
            "image/avif,image/webp,image/png,image/jpeg,*/*"
        }
      }
    );

  if(!response.ok){

    throw new Error(
      `Ürün görseli indirilemedi (${response.status}).`
    );
  }

  const contentType =
    (
      response.headers
        .get("content-type") || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

  if(!ALLOWED_MIME.has(contentType)){

    throw new Error(
      `Desteklenmeyen ürün görseli türü: ${
        contentType || "bilinmiyor"
      }`
    );
  }

  const blob =
    await response.blob();

  if(
    blob.size >
    MAX_PRODUCT_BYTES
  ){

    throw new Error(
      "Ürün görseli çok büyük."
    );
  }

  const extension =
    contentType === "image/png"
      ? "png"
      :
    contentType === "image/webp"
      ? "webp"
      :
    "jpg";

  return new File(
    [blob],
    `product.${extension}`,
    {
      type:contentType
    }
  );
}

export async function POST(request){

  try{

    if(!process.env.FAL_KEY){

      return responseJson(
        request,
        {
          ok:false,
          error:
            "Sunucuda FAL_KEY tanımlı değil."
        },
        500
      );
    }

    if(!isOriginAllowed(request)){

      return responseJson(
        request,
        {
          ok:false,
          error:
            "Bu domain API'yi kullanmaya yetkili değil."
        },
        403
      );
    }

    const form =
      await request.formData();

    const personImage =
      form.get("personImage");

    const productImageUrl =
      String(
        form.get("productImageUrl") || ""
      ).trim();

    const productCode =
      String(
        form.get("productCode") || ""
      ).trim();

    const productName =
      String(
        form.get("productName") || ""
      ).trim();

    let category =
      String(
        form.get("category") || "auto"
      ).trim();

    if(
      !ALLOWED_CATEGORIES.has(
        category
      )
    ){
      category = "auto";
    }

    if(
      !(personImage instanceof File)
    ){

      return responseJson(
        request,
        {
          ok:false,
          error:
            "Müşteri fotoğrafı eksik."
        },
        400
      );
    }

    if(
      !ALLOWED_MIME.has(
        personImage.type
      )
    ){

      return responseJson(
        request,
        {
          ok:false,
          error:
            "Fotoğraf JPG, PNG veya WEBP olmalı."
        },
        400
      );
    }

    if(
      personImage.size >
      MAX_PERSON_BYTES
    ){

      return responseJson(
        request,
        {
          ok:false,
          error:
            "Fotoğraf 4 MB'dan küçük olmalı."
        },
        413
      );
    }

    if(!productImageUrl){

      return responseJson(
        request,
        {
          ok:false,
          error:
            "Ürün görseli bulunamadı."
        },
        400
      );
    }

    fal.config({
      credentials:
        process.env.FAL_KEY
    });

    const productFile =
      await fetchProductImageAsFile(
        productImageUrl
      );

    const [
      personUrl,
      clothingUrl
    ] =
      await Promise.all([
        fal.storage.upload(
          personImage
        ),
        fal.storage.upload(
          productFile
        )
      ]);

    const model =
      process.env.FAL_MODEL ||
      "fal-ai/fashn/tryon/v1.6";

    console.log(
      "TRY_ON_REQUEST",
      {
        model,
        category,
        productCode,
        productName
      }
    );

    const result =
      await fal.subscribe(
        model,
        {
          input:{

            model_image:
              personUrl,

            garment_image:
              clothingUrl,

            category:
              category,

            garment_photo_type:
              "model",

            mode:
              "quality",

            num_samples:
              1,

            segmentation_free:
              true,

            moderation_level:
              "permissive",

            output_format:
              "png"
          },

          logs:false
        }
      );

    const imageUrl =
      result?.data
        ?.images?.[0]
        ?.url;

    if(!imageUrl){

      throw new Error(
        "AI sonucunda görsel URL'si bulunamadı."
      );
    }

    return responseJson(
      request,
      {
        ok:true,

        imageUrl,

        requestId:
          result.requestId ||
          null,

        category,

        product:{
          code:
            productCode ||
            null,

          name:
            productName ||
            null
        }
      }
    );

  }catch(error){

    console.error(
      "TRY_ON_ERROR",
      error
    );

    return responseJson(
      request,
      {
        ok:false,

        error:
          "AI denemesi oluşturulamadı.",

        detail:
          String(
            error?.message ||
            error
          )
      },
      500
    );
  }
}
