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
        .select("id,name,description,status,identity_public_key,created_at")
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
      const { data: auditEntries, error: auditError } = await admin.from("mt_service_audit")
        .select("id,action,details,created_at")
        .eq("account_id", account.id).order("created_at", { ascending: false }).limit(50);
      if (auditError) throw auditError;

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
        const { identity_public_key: publicKey, ...safeApp } = app;
        return {
          ...safeApp,
          identityConfigured: Boolean(publicKey),
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
        audit: auditEntries ?? [],
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

    if (action === "set_identity_public_key") {
      const appId = typeof body.appId === "string" ? body.appId : "";
      const publicKey = body.publicKey;
      if (!appId || !publicKey || typeof publicKey !== "object" ||
          publicKey.kty !== "EC" || publicKey.crv !== "P-256" ||
          typeof publicKey.x !== "string" || typeof publicKey.y !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(publicKey.x) ||
          !/^[A-Za-z0-9_-]{43}$/.test(publicKey.y) || "d" in publicKey) {
        return json({ error: "Enviá una clave pública JWK ECDSA P-256 válida. Nunca subas la clave privada." }, 400);
      }
      const { data: app, error: appError } = await admin.from("mt_service_apps")
        .select("id").eq("id", appId).eq("account_id", account.id).maybeSingle();
      if (appError) throw appError;
      if (!app) return json({ error: "Aplicación no encontrada." }, 404);
      const { error: updateError } = await admin.from("mt_service_apps")
        .update({ identity_public_key: { kty: "EC", crv: "P-256", x: publicKey.x, y: publicKey.y, ext: true } })
        .eq("id", appId).eq("account_id", account.id);
      if (updateError) throw updateError;
      const { error: auditError } = await admin.from("mt_service_audit").insert({
        account_id: account.id, actor_id: ownerId, action: "identity_public_key_registered",
        details: { app_id: appId },
      });
      if (auditError) throw auditError;
      return json({ success: true, appId });
    }

    if (action === "create_key") {
      const appId = typeof body.appId === "string" ? body.appId : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const scopes = Array.isArray(body.scopes) ? body.scopes : [];
      const allowedScopes = ["records:read", "records:write", "files:read", "files:write"];
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


    if (action === "app_explorer") {
      const appId = typeof body.appId === "string" ? body.appId : "";
      if (!appId) return json({ error: "Falta la aplicación seleccionada." }, 400);
      const { data: app, error: appError } = await admin.from("mt_service_apps")
        .select("id,name,description,status").eq("id", appId).eq("account_id", account.id).maybeSingle();
      if (appError) throw appError;
      if (!app) return json({ error: "Aplicación no encontrada." }, 404);
      const { data: rows, error: rowsError } = await admin.from("mt_service_objects")
        .select("id,external_user_id,object_type,object_category,object_key,payload,size_bytes,content_type,created_at,updated_at,storage_path")
        .eq("account_id", account.id).eq("app_id", appId).order("updated_at", { ascending: false }).limit(1000);
      if (rowsError) throw rowsError;
      const byUser = new Map<string, { externalUserId: string; email: string; name: string; objects: number; chats: number; files: number }>();
      for (const row of rows ?? []) {
        const user = byUser.get(row.external_user_id) ?? { externalUserId: row.external_user_id, email: "", name: row.external_user_id, objects: 0, chats: 0, files: 0 };
        user.objects++;
        if (row.object_category === "chat") user.chats++;
        if (row.object_type === "file") user.files++;
        if (row.object_category === "user" && row.payload && typeof row.payload === "object") {
          user.email = typeof row.payload.email === "string" ? row.payload.email : user.email;
          user.name = typeof row.payload.name === "string" ? row.payload.name : user.name;
        }
        byUser.set(row.external_user_id, user);
      }
      return json({ app, users: [...byUser.values()], objects: (rows ?? []).map(({ storage_path: _path, ...row }) => row) });
    }

    if (action === "update_record") {
      const objectId = typeof body.objectId === "string" ? body.objectId : "";
      const payload = body.payload;
      if (!objectId || !payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "Registro y objeto JSON válidos requeridos." }, 400);
      const serialized = JSON.stringify(payload);
      if (serialized.length > 262144) return json({ error: "El registro supera el máximo de 256 KiB." }, 413);
      const { data: row, error: lookupError } = await admin.from("mt_service_objects")
        .select("id,app_id,object_key,external_user_id,object_type").eq("id", objectId).eq("account_id", account.id).eq("object_type", "record").maybeSingle();
      if (lookupError) throw lookupError;
      if (!row) return json({ error: "Registro no encontrado." }, 404);
      const { error: updateError } = await admin.from("mt_service_objects")
        .update({ payload, size_bytes: new TextEncoder().encode(serialized).byteLength, updated_at: new Date().toISOString() })
        .eq("id", objectId).eq("account_id", account.id);
      if (updateError) throw updateError;
      const { error: auditError } = await admin.from("mt_service_audit").insert({
        account_id: account.id, actor_id: ownerId, action: "service_record_updated",
        details: { app_id: row.app_id, object_id: objectId, external_user_id: row.external_user_id, object_key: row.object_key },
      });
      if (auditError) throw auditError;
      return json({ success: true });
    }

    if (action === "delete_record") {
      const objectId = typeof body.objectId === "string" ? body.objectId : "";
      if (!objectId) return json({ error: "Falta el registro seleccionado." }, 400);
      const { data: row, error: lookupError } = await admin.from("mt_service_objects")
        .select("id,app_id,object_key,external_user_id,object_type,storage_path").eq("id", objectId).eq("account_id", account.id).maybeSingle();
      if (lookupError) throw lookupError;
      if (!row) return json({ error: "Registro no encontrado." }, 404);
      if (row.object_type === "file" && row.storage_path) {
        const { error: storageError } = await admin.storage.from("memory-task-service-private").remove([row.storage_path]);
        if (storageError) throw storageError;
      }
      const { error: deleteError } = await admin.from("mt_service_objects").delete().eq("id", objectId).eq("account_id", account.id);
      if (deleteError) throw deleteError;
      const { error: auditError } = await admin.from("mt_service_audit").insert({
        account_id: account.id, actor_id: ownerId, action: "service_object_deleted",
        details: { app_id: row.app_id, object_id: objectId, external_user_id: row.external_user_id, object_key: row.object_key },
      });
      if (auditError) throw auditError;
      return json({ success: true });
    }

    if (action === "service_file_link") {
      const objectId = typeof body.objectId === "string" ? body.objectId : "";
      const { data: row, error: lookupError } = await admin.from("mt_service_objects")
        .select("id,app_id,external_user_id,object_key,storage_path,content_type").eq("id", objectId)
        .eq("account_id", account.id).eq("object_type", "file").maybeSingle();
      if (lookupError) throw lookupError;
      if (!row || !row.storage_path) return json({ error: "Archivo no encontrado." }, 404);
      const { data: signed, error: signedError } = await admin.storage.from("memory-task-service-private")
        .createSignedUrl(row.storage_path, 60);
      if (signedError) throw signedError;
      const { error: auditError } = await admin.from("mt_service_audit").insert({
        account_id: account.id, actor_id: ownerId, action: "service_file_previewed",
        details: { app_id: row.app_id, object_id: row.id, external_user_id: row.external_user_id },
      });
      if (auditError) throw auditError;
      return json({ signedUrl: signed.signedUrl, contentType: row.content_type });
    }

    if (action === "delete_app") {
      const appId = typeof body.appId === "string" ? body.appId : "";
      if (!appId) return json({ error: "Identificador de aplicación requerido." }, 400);
      const { data: app, error: appError } = await admin.from("mt_service_apps")
        .select("id,name").eq("id", appId).eq("account_id", account.id).maybeSingle();
      if (appError) throw appError;
      if (!app) return json({ error: "Aplicación no encontrada." }, 404);
      const { data: fileRows, error: filesError } = await admin.from("mt_service_objects")
        .select("storage_path").eq("account_id", account.id).eq("app_id", appId).eq("object_type", "file");
      if (filesError) throw filesError;
      const paths = (fileRows ?? []).map(row => row.storage_path).filter(Boolean);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from("memory-task-service-private").remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
      const { error: auditError } = await admin.from("mt_service_audit").insert({
        account_id: account.id, actor_id: ownerId, action: "service_app_deleted",
        details: { app_id: appId, app_name: app.name, removed_files: paths.length },
      });
      if (auditError) throw auditError;
      const { error: deleteError } = await admin.from("mt_service_apps").delete().eq("id", appId).eq("account_id", account.id);
      if (deleteError) throw deleteError;
      return json({ success: true, removedFiles: paths.length });
    }

    if (action === "delete_revoked_key") {
      const keyId = typeof body.keyId === "string" ? body.keyId : "";
      if (!keyId) return json({ error: "Identificador de clave requerido." }, 400);
      const { data: key, error: keyError } = await admin.from("mt_service_api_keys")
        .select("id,name,status").eq("id", keyId).eq("account_id", account.id).maybeSingle();
      if (keyError) throw keyError;
      if (!key || key.status !== "revoked") return json({ error: "Solo se pueden eliminar claves ya revocadas." }, 409);
      const { error: auditError } = await admin.from("mt_service_audit").insert({
        account_id: account.id, actor_id: ownerId, action: "revoked_api_key_deleted",
        details: { key_id: keyId, key_name: key.name },
      });
      if (auditError) throw auditError;
      const { error: deleteError } = await admin.from("mt_service_api_keys").delete()
        .eq("id", keyId).eq("account_id", account.id).eq("status", "revoked");
      if (deleteError) throw deleteError;
      return json({ success: true });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (error) {
    console.error("service-console:", error);
    return json({ error: "No se pudo completar la operación de cuenta de servicio." }, 500);
  }
});
