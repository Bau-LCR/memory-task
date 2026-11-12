import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "mt_live_" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Configuración del servidor incompleta." }, 500);

    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sesión requerida." }, 401);

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sesión inválida o vencida." }, 401);
    const ownerId = authData.user.id;

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // Create the one service account lazily for the authenticated owner.
    let { data: account, error: accountError } = await admin
      .from("mt_service_accounts").select("id,quota_bytes,created_at")
      .eq("owner_id", ownerId).maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      const created = await admin.from("mt_service_accounts")
        .insert({ owner_id: ownerId }).select("id,quota_bytes,created_at").single();
      if (created.error) throw created.error;
      account = created.data;
    }

    if (action === "overview") {
      const { data: apps, error: appsError } = await admin
        .from("mt_service_apps")
        .select("id,name,description,status,created_at")
        .eq("account_id", account.id).order("created_at", { ascending: false });
      if (appsError) throw appsError;

      const { data: objects, error: objectsError } = await admin
        .from("mt_service_objects").select("app_id,external_user_id,object_category,object_type,size_bytes")
        .eq("account_id", account.id);
      if (objectsError) throw objectsError;

      const { data: keys, error: keysError } = await admin
        .from("mt_service_api_keys")
        .select("id,app_id,name,key_prefix,scopes,status,last_used_at,expires_at,created_at")
        .eq("account_id", account.id).order("created_at", { ascending: false });
      if (keysError) throw keysError;

      const objectRows = objects ?? [];
      const usedBytes = objectRows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
      const appStats = (apps ?? []).map((app) => {
        const rows = objectRows.filter((row) => row.app_id === app.id);
        const categories: Record<string, { count: number; bytes: number }> = {};
        for (const row of rows) {
          const category = row.object_category || "custom";
          categories[category] ??= { count: 0, bytes: 0 };
          categories[category].count += 1;
          categories[category].bytes += Number(row.size_bytes || 0);
        }
        return {
          ...app,
          objectCount: rows.length,
          externalUserCount: new Set(rows.map((row) => row.external_user_id)).size,
          usedBytes: rows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0),
          categories,
        };
      });
      return json({
        account: { id: account.id, quotaBytes: Number(account.quota_bytes), usedBytes },
        apps: appStats,
        keys: keys ?? [],
      });
    }

    if (action === "set_quota") {
      const quotaBytes = Number(body.quotaBytes);
      if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 52428800 || quotaBytes > 5368709120) {
        return json({ error: "La cuota debe estar entre 50 MiB y 5 GiB." }, 400);
      }
      const { data: usedRows, error: usedError } = await admin.from("mt_service_objects")
        .select("size_bytes").eq("account_id", account.id);
      if (usedError) throw usedError;
      const usedBytes = (usedRows ?? []).reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
      if (quotaBytes < usedBytes) return json({ error: "La cuota no puede ser menor al espacio que ya utilizan tus aplicaciones." }, 409);
      const { error: updateError } = await admin.from("mt_service_accounts")
        .update({ quota_bytes: quotaBytes }).eq("id", account.id);
      if (updateError) throw updateError;
      const { error: auditError } = await admin.from("mt_service_audit").insert({
        account_id: account.id, actor_id: ownerId, action: "service_quota_changed",
        details: { quota_bytes: quotaBytes },
      });
      if (auditError) throw auditError;
      return json({ success: true, quotaBytes });
    }

    if (action === "create_app") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!name || name.length > 80 || description.length > 300) {
        return json({ error: "Nombre obligatorio (máximo 80 caracteres) y descripción de hasta 300." }, 400);
      }
      const { data, error } = await admin.from("mt_service_apps")
        .insert({ account_id: account.id, name, description })
        .select("id,name,description,status,created_at").single();
      if (error) throw error;
      return json({ app: data }, 201);
    }

    if (action === "create_key") {
      const appId = typeof body.appId === "string" ? body.appId : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const scopes = Array.isArray(body.scopes) ? body.scopes : [];
      const allowedScopes = ["records:read", "records:write"];
      if (!appId || !name || name.length > 80 || scopes.length < 1 ||
          scopes.some((scope: unknown) => !allowedScopes.includes(String(scope)))) {
        return json({ error: "Aplicación, nombre y permisos válidos son obligatorios." }, 400);
      }
      const { data: app, error: appError } = await admin.from("mt_service_apps")
        .select("id").eq("id", appId).eq("account_id", account.id)
        .eq("status", "active").maybeSingle();
      if (appError) throw appError;
      if (!app) return json({ error: "Aplicación no encontrada o suspendida." }, 404);

      const secret = randomSecret();
      const prefix = secret.slice(0, 15);
      const { data, error } = await admin.from("mt_service_api_keys").insert({
        account_id: account.id,
        app_id: appId,
        name,
        key_prefix: prefix,
        secret_hash: `\\x${await sha256(secret)}`,
        secret_hash_hex: await sha256(secret),
        scopes: [...new Set(scopes)],
      }).select("id,app_id,name,key_prefix,scopes,status,created_at").single();
      if (error) throw error;
      // The raw secret is returned only once and is never stored.
      return json({ key: data, secret }, 201);
    }

    if (action === "revoke_key") {
      const keyId = typeof body.keyId === "string" ? body.keyId : "";
      if (!keyId) return json({ error: "Identificador de clave requerido." }, 400);
      const { data, error } = await admin.from("mt_service_api_keys")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", keyId).eq("account_id", account.id).eq("status", "active")
        .select("id,status").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Clave no encontrada o ya revocada." }, 404);
      return json({ key: data });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (error) {
    console.error("service-console:", error);
    return json({ error: "No se pudo completar la operación de cuenta de servicio." }, 500);
  }
});
