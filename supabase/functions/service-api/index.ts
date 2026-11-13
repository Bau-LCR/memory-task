import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-memory-task-identity",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const encoder = new TextEncoder();
const categories = ["user", "chat", "document", "image", "custom"];

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
async function verifyIdentityAssertion(token: string, appId: string, publicJwk: JsonWebKey | null): Promise<string | null> {
  if (!publicJwk || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg !== "ES256" || typeof claims.sub !== "string" || !claims.sub.trim() ||
        claims.sub.length > 200 || claims.iss !== appId ||
        !(claims.aud === appId || (Array.isArray(claims.aud) && claims.aud.includes(appId)))) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(claims.exp) || claims.exp <= now || claims.exp > now + 300 ||
        !Number.isInteger(claims.iat) || claims.iat > now + 60 || claims.iat < now - 300) return null;
    const publicKey = await crypto.subtle.importKey(
      "jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      decodeBase64Url(parts[2]),
      encoder.encode(parts[0] + "." + parts[1]),
    );
    return valid ? claims.sub.trim() : null;
  } catch {
    return null;
  }
}
async function audit(admin: any, accountId: string, appId: string, action: string, externalUserId: string, details: Record<string, unknown> = {}) {
  const { error } = await admin.from("mt_service_audit").insert({
    account_id: accountId,
    action,
    details: { app_id: appId, external_user_id: externalUserId, ...details },
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Usá POST para las operaciones de la API." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Configuración del servidor incompleta." }, 500);
    const authorization = req.headers.get("Authorization") ?? "";
    const apiKey = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey.startsWith("mt_live_") || apiKey.length < 40) return json({ error: "Clave API inválida." }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const hash = await sha256(apiKey);
    const { data: key, error: keyError } = await admin.from("mt_service_api_keys")
      .select("id,account_id,app_id,scopes,expires_at")
      .eq("secret_hash_hex", hash).eq("status", "active").maybeSingle();
    if (keyError) throw keyError;
    if (!key || (key.expires_at && new Date(key.expires_at).getTime() <= Date.now())) {
      return json({ error: "Clave API inválida, revocada o vencida." }, 401);
    }
    const { data: app, error: appError } = await admin.from("mt_service_apps")
      .select("id,status,identity_public_key").eq("id", key.app_id).eq("account_id", key.account_id).maybeSingle();
    if (appError) throw appError;
    if (!app || app.status !== "active") return json({ error: "La aplicación está suspendida o no existe." }, 403);
    const identityToken = req.headers.get("X-Memory-Task-Identity") ?? "";
    const externalUserId = await verifyIdentityAssertion(identityToken, app.id, app.identity_public_key as JsonWebKey | null);
    if (!externalUserId) {
      return json({ error: "Identidad externa inválida. Tu backend debe firmar un token ES256 para el usuario autenticado." }, 401);
    }

    const isMultipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
    const body: any = isMultipart ? await req.formData() : await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Falta el cuerpo de la solicitud." }, 400);
    const action = isMultipart ? String(body.get("action") ?? "") : body.action;
    const readActions = ["get", "list", "download_file", "list_files"];
    const writeActions = ["put", "delete", "upload_file", "delete_file"];
    if (!readActions.includes(action) && !writeActions.includes(action)) {
      return json({ error: "Acción no válida. Consultá la documentación de la API." }, 400);
    }
    const requiredScope = readActions.includes(action) ? "records:read" : "records:write";
    const requiredScopes = action.endsWith("_file") || action === "list_files"
      ? (readActions.includes(action) ? ["files:read"] : ["files:write"])
      : [requiredScope];
    if (!requiredScopes.every((scope) => (key.scopes ?? []).includes(scope))) {
      return json({ error: "La clave no tiene los permisos requeridos: " + requiredScopes.join(", ") }, 403);
    }

    const { error: usedError } = await admin.from("mt_service_api_keys")
      .update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
    if (usedError) throw usedError;

    if (action === "put") {
      const objectKey = typeof body.key === "string" ? body.key.trim() : "";
      const category = typeof body.category === "string" ? body.category : "custom";
      const payload = body.data;
      if (!objectKey || objectKey.length > 200) return json({ error: "La clave del registro es obligatoria y admite hasta 200 caracteres." }, 400);
      if (!categories.includes(category)) return json({ error: "Categoría no válida." }, 400);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "data debe ser un objeto JSON." }, 400);
      const sizeBytes = encoder.encode(JSON.stringify(payload)).byteLength;
      if (sizeBytes > 262144) return json({ error: "Cada registro admite hasta 256 KiB." }, 413);
      const { data, error } = await admin.from("mt_service_objects").upsert({
        account_id: key.account_id, app_id: key.app_id, external_user_id: externalUserId,
        object_type: "record", object_category: category, object_key: objectKey,
        storage_path: null, payload, size_bytes: sizeBytes, content_type: "application/json",
        updated_at: new Date().toISOString(),
      }, { onConflict: "app_id,external_user_id,object_key" })
        .select("id,object_key,object_category,size_bytes,created_at,updated_at").single();
      if (error) {
        if (error.code === "23514") return json({ error: "Se alcanzó la cuota de almacenamiento de esta cuenta de servicio." }, 413);
        throw error;
      }
      await audit(admin, key.account_id, key.app_id, "record_upserted", externalUserId, { object_key: objectKey, category, size_bytes: sizeBytes });
      return json({ record: data });
    }

    if (action === "get") {
      const objectKey = typeof body.key === "string" ? body.key : "";
      if (!objectKey) return json({ error: "Falta la clave del registro." }, 400);
      const { data, error } = await admin.from("mt_service_objects")
        .select("id,object_key,object_category,payload,size_bytes,created_at,updated_at")
        .eq("account_id", key.account_id).eq("app_id", key.app_id).eq("external_user_id", externalUserId)
        .eq("object_key", objectKey).eq("object_type", "record").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Registro no encontrado." }, 404);
      await audit(admin, key.account_id, key.app_id, "record_read", externalUserId, { object_key: objectKey });
      return json({ record: data });
    }

    if (action === "list") {
      const limit = Math.max(1, Math.min(100, Number.isInteger(body.limit) ? body.limit : 50));
      let query = admin.from("mt_service_objects")
        .select("id,object_key,object_category,payload,size_bytes,created_at,updated_at")
        .eq("account_id", key.account_id).eq("app_id", key.app_id)
        .eq("external_user_id", externalUserId).eq("object_type", "record")
        .order("updated_at", { ascending: false }).limit(limit);
      if (typeof body.category === "string" && categories.includes(body.category)) query = query.eq("object_category", body.category);
      const { data, error } = await query;
      if (error) throw error;
      await audit(admin, key.account_id, key.app_id, "records_listed", externalUserId, { count: data?.length ?? 0 });
      return json({ records: data ?? [], count: data?.length ?? 0 });
    }

    if (action === "delete") {
      const objectKey = typeof body.key === "string" ? body.key : "";
      if (!objectKey) return json({ error: "Falta la clave del registro." }, 400);
      const { data, error } = await admin.from("mt_service_objects").delete()
        .eq("account_id", key.account_id).eq("app_id", key.app_id)
        .eq("external_user_id", externalUserId).eq("object_key", objectKey)
        .eq("object_type", "record").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Registro no encontrado." }, 404);
      await audit(admin, key.account_id, key.app_id, "record_deleted", externalUserId, { object_key: objectKey });
      return json({ deleted: true });
    }

    if (action === "upload_file") {
      if (!isMultipart) return json({ error: "upload_file requiere multipart/form-data." }, 400);
      const file = body.get("file");
      const objectKey = String(body.get("key") ?? "").trim();
      const category = String(body.get("category") ?? "custom");
      if (!(file instanceof File) || !objectKey || objectKey.length > 200) return json({ error: "Archivo y clave de registro obligatorios." }, 400);
      if (!categories.includes(category)) return json({ error: "Categoría no válida." }, 400);
      if (file.size < 1 || file.size > 10485760) return json({ error: "Cada archivo debe pesar entre 1 byte y 10 MiB." }, 413);
      const safeName = file.name.normalize("NFKC").replace(/[^\w.\-() ]/g, "_").slice(0, 120) || "archivo";
      const storagePath = key.account_id + "/" + key.app_id + "/" + crypto.randomUUID() + "/" + safeName;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage.from("memory-task-service-private")
        .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) throw uploadError;
      const { data, error } = await admin.from("mt_service_objects").upsert({
        account_id: key.account_id, app_id: key.app_id, external_user_id: externalUserId,
        object_type: "file", object_category: category, object_key: objectKey,
        storage_path: storagePath, payload: null, size_bytes: file.size,
        content_type: file.type || "application/octet-stream", updated_at: new Date().toISOString(),
      }, { onConflict: "app_id,external_user_id,object_key" })
        .select("id,object_key,object_category,size_bytes,content_type,created_at,updated_at").single();
      if (error) {
        await admin.storage.from("memory-task-service-private").remove([storagePath]);
        if (error.code === "23514") return json({ error: "Se alcanzó la cuota compartida de servicio." }, 413);
        throw error;
      }
      if (previousFile?.storage_path) {
        const { error: cleanupError } = await admin.storage.from("memory-task-service-private").remove([previousFile.storage_path]);
        if (cleanupError) console.error("No se pudo limpiar el archivo anterior:", cleanupError.message);
      }
      await audit(admin, key.account_id, key.app_id, "file_uploaded", externalUserId, { object_key: objectKey, file_name: safeName, size_bytes: file.size, replaced: Boolean(previousFile) });
      return json({ file: data }, 201);
    }

    if (action === "download_file") {
      const objectKey = typeof body.key === "string" ? body.key : "";
      if (!objectKey) return json({ error: "Falta la clave del archivo." }, 400);
      const { data: file, error } = await admin.from("mt_service_objects")
        .select("id,object_key,storage_path,content_type,size_bytes")
        .eq("account_id", key.account_id).eq("app_id", key.app_id).eq("external_user_id", externalUserId)
        .eq("object_key", objectKey).eq("object_type", "file").maybeSingle();
      if (error) throw error;
      if (!file) return json({ error: "Archivo no encontrado." }, 404);
      const { data: signed, error: signedError } = await admin.storage.from("memory-task-service-private")
        .createSignedUrl(file.storage_path, 60);
      if (signedError) throw signedError;
      await audit(admin, key.account_id, key.app_id, "file_download_link_created", externalUserId, { object_key: objectKey });
      return json({ signedUrl: signed.signedUrl, expiresInSeconds: 60, contentType: file.content_type, sizeBytes: file.size_bytes });
    }

    if (action === "list_files") {
      const limit = Math.max(1, Math.min(100, Number.isInteger(body.limit) ? body.limit : 50));
      const { data, error } = await admin.from("mt_service_objects")
        .select("id,object_key,object_category,content_type,size_bytes,created_at,updated_at")
        .eq("account_id", key.account_id).eq("app_id", key.app_id)
        .eq("external_user_id", externalUserId).eq("object_type", "file")
        .order("updated_at", { ascending: false }).limit(limit);
      if (error) throw error;
      await audit(admin, key.account_id, key.app_id, "files_listed", externalUserId, { count: data?.length ?? 0 });
      return json({ files: data ?? [], count: data?.length ?? 0 });
    }

    if (action === "delete_file") {
      const objectKey = typeof body.key === "string" ? body.key : "";
      if (!objectKey) return json({ error: "Falta la clave del archivo." }, 400);
      const { data: file, error } = await admin.from("mt_service_objects")
        .select("id,storage_path").eq("account_id", key.account_id).eq("app_id", key.app_id)
        .eq("external_user_id", externalUserId).eq("object_key", objectKey).eq("object_type", "file").maybeSingle();
      if (error) throw error;
      if (!file) return json({ error: "Archivo no encontrado." }, 404);
      const { error: storageError } = await admin.storage.from("memory-task-service-private").remove([file.storage_path]);
      if (storageError) throw storageError;
      const { error: deleteError } = await admin.from("mt_service_objects").delete().eq("id", file.id);
      if (deleteError) throw deleteError;
      await audit(admin, key.account_id, key.app_id, "file_deleted", externalUserId, { object_key: objectKey });
      return json({ deleted: true });
    }
  } catch (error) {
    console.error("service-api:", error);
    return json({ error: "No se pudo completar la operación de la API." }, 500);
  }
});
