import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-memory-task-user-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Usá POST para las operaciones de la API." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Configuración del servidor incompleta." }, 500);

    const authorization = req.headers.get("Authorization") ?? "";
    const apiKey = authorization.replace(/^Bearer\\s+/i, "").trim();
    if (!apiKey.startsWith("mt_live_") || apiKey.length < 40) {
      return json({ error: "Clave API inválida." }, 401);
    }
    const externalUserId = (req.headers.get("X-Memory-Task-User-Id") ?? "").trim();
    if (!externalUserId || externalUserId.length > 200) {
      return json({ error: "Falta X-Memory-Task-User-Id. Enviá el identificador autenticado desde el servidor de tu aplicación." }, 400);
    }

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
      .select("id,status").eq("id", key.app_id).eq("account_id", key.account_id).maybeSingle();
    if (appError) throw appError;
    if (!app || app.status !== "active") return json({ error: "La aplicación está suspendida o no existe." }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "El cuerpo debe ser un objeto JSON." }, 400);
    const action = body.action;
    const readActions = ["get", "list"];
    const writeActions = ["put", "delete"];
    if (!readActions.includes(action) && !writeActions.includes(action)) {
      return json({ error: "Acción no válida. Usá get, list, put o delete." }, 400);
    }
    const requiredScope = readActions.includes(action) ? "records:read" : "records:write";
    if (!(key.scopes ?? []).includes(requiredScope)) return json({ error: "La clave no tiene el permiso requerido: " + requiredScope }, 403);

    await admin.from("mt_service_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

    if (action === "put") {
      const objectKey = typeof body.key === "string" ? body.key.trim() : "";
      const category = typeof body.category === "string" ? body.category : "custom";
      const payload = body.data;
      if (!objectKey || objectKey.length > 200) return json({ error: "La clave del registro es obligatoria y admite hasta 200 caracteres." }, 400);
      if (!["user", "chat", "document", "image", "custom"].includes(category)) return json({ error: "Categoría no válida." }, 400);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "data debe ser un objeto JSON." }, 400);
      const serialized = JSON.stringify(payload);
      const sizeBytes = encoder.encode(serialized).byteLength;
      if (sizeBytes > 262144) return json({ error: "Cada registro admite hasta 256 KiB. Para archivos usaremos el endpoint de archivos." }, 413);
      const { data, error } = await admin.from("mt_service_objects").upsert({
        account_id: key.account_id,
        app_id: key.app_id,
        external_user_id: externalUserId,
        object_type: "record",
        object_category: category,
        object_key: objectKey,
        storage_path: null,
        payload,
        size_bytes: sizeBytes,
        content_type: "application/json",
        updated_at: new Date().toISOString(),
      }, { onConflict: "app_id,external_user_id,object_key" })
        .select("id,object_key,object_category,size_bytes,created_at,updated_at").single();
      if (error) {
        if (error.code === "23514") return json({ error: "Se alcanzó la cuota de almacenamiento de esta cuenta de servicio." }, 413);
        throw error;
      }
      return json({ record: data }, 200);
    }

    if (action === "get") {
      const objectKey = typeof body.key === "string" ? body.key : "";
      if (!objectKey) return json({ error: "Falta la clave del registro." }, 400);
      const { data, error } = await admin.from("mt_service_objects")
        .select("id,object_key,object_category,payload,size_bytes,created_at,updated_at")
        .eq("account_id", key.account_id).eq("app_id", key.app_id)
        .eq("external_user_id", externalUserId).eq("object_key", objectKey)
        .eq("object_type", "record").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Registro no encontrado." }, 404);
      return json({ record: data });
    }

    if (action === "list") {
      const limit = Math.max(1, Math.min(100, Number.isInteger(body.limit) ? body.limit : 50));
      let query = admin.from("mt_service_objects")
        .select("id,object_key,object_category,payload,size_bytes,created_at,updated_at")
        .eq("account_id", key.account_id).eq("app_id", key.app_id)
        .eq("external_user_id", externalUserId).eq("object_type", "record")
        .order("updated_at", { ascending: false }).limit(limit);
      if (typeof body.category === "string" && ["user", "chat", "document", "image", "custom"].includes(body.category)) {
        query = query.eq("object_category", body.category);
      }
      const { data, error } = await query;
      if (error) throw error;
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
      return json({ deleted: true });
    }
  } catch (error) {
    console.error("service-api:", error);
    return json({ error: "No se pudo completar la operación de la API." }, 500);
  }
});
