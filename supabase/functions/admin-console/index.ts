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

const principalId = "f4b4fc8e-88d2-41d2-9b44-fa9ee19d2836";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return json({ error: "Configuración del servidor incompleta." }, 500);
    }

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\\s+/i, "");
    if (!token) return json({ error: "Sesión requerida." }, 401);

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sesión inválida o vencida." }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const actorId = authData.user.id;
    const { data: roleRow, error: roleError } = await admin
      .from("mt_user_roles").select("role").eq("user_id", actorId).maybeSingle();
    if (roleError) throw roleError;

    // El UUID principal también se reconoce como super_admin para permitir
    // recuperar el acceso si la fila de rol se elimina accidentalmente.
    const actorRole = actorId === principalId ? "super_admin" : (roleRow?.role ?? "user");
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "check_access") {
      return json({ role: actorRole });
    }
    if (actorRole !== "super_admin" && actorRole !== "admin") {
      return json({ error: "No tenés permisos para acceder al panel administrativo." }, 403);
    }

    if (action === "overview") {
      const users = [];
      for (let page = 1; ; page++) {
        const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
          page, perPage: 1000,
        });
        if (usersError) throw usersError;
        const batch = usersData.users ?? [];
        users.push(...batch);
        if (batch.length < 1000) break;
      }
      const { data: roles, error: rolesError } = await admin
        .from("mt_user_roles").select("user_id,role,created_at");
      if (rolesError) throw rolesError;
      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
      return json({
        total: users.length,
        users: users.map((user) => ({
          id: user.id,
          email: user.email ?? "",
          name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Usuario"),
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
          role: user.id === principalId ? "super_admin" : (roleMap.get(user.id) ?? "user"),
        })),
      });
    }

    if (action === "user_details") {
      const targetId = typeof body.userId === "string" ? body.userId : "";
      if (!targetId) return json({ error: "Falta el usuario seleccionado." }, 400);
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetId);
      if (targetError || !target.user) return json({ error: "Usuario no encontrado." }, 404);

      const { error: auditError } = await admin.from("mt_admin_audit").insert({
        actor_id: actorId,
        target_user_id: targetId,
        action: "user_data_viewed",
        details: { scope: "profile,memories,files,folders,activity" },
      });
      if (auditError) throw auditError;

      const [memories, files, folders, activity, usage] = await Promise.all([
        admin.from("mt_memories").select("id,title,body,category,tags,created_at,updated_at").eq("owner_id", targetId).order("updated_at", { ascending: false }).limit(200),
        admin.from("mt_files").select("id,name,size_bytes,content_type,folder_id,storage_path,created_at").eq("owner_id", targetId).order("created_at", { ascending: false }).limit(500),
        admin.from("mt_folders").select("id,name,parent_id,created_at").eq("owner_id", targetId).order("created_at", { ascending: false }).limit(200),
        admin.from("mt_activity").select("id,description,created_at").eq("owner_id", targetId).order("created_at", { ascending: false }).limit(100),
        admin.from("mt_files").select("size_bytes").eq("owner_id", targetId),
      ]);
      for (const result of [memories, files, folders, activity, usage]) {
        if (result.error) throw result.error;
      }
      const usedBytes = (usage.data ?? []).reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
      return json({
        user: {
          id: target.user.id,
          email: target.user.email ?? "",
          name: String(target.user.user_metadata?.full_name ?? target.user.user_metadata?.name ?? target.user.email ?? "Usuario"),
          created_at: target.user.created_at,
          last_sign_in_at: target.user.last_sign_in_at ?? null,
        },
        usage: { usedBytes, quotaBytes: 52428800 },
        memories: memories.data ?? [],
        files: (files.data ?? []).map(({ storage_path: _privatePath, ...file }) => file),
        folders: folders.data ?? [],
        activity: activity.data ?? [],
      });
    }

    if (action === "create_file_link") {
      const fileId = typeof body.fileId === "string" ? body.fileId : "";
      if (!fileId) return json({ error: "Falta el archivo seleccionado." }, 400);
      const { data: file, error: fileError } = await admin.from("mt_files")
        .select("id,name,storage_path").eq("id", fileId).maybeSingle();
      if (fileError) throw fileError;
      if (!file) return json({ error: "Archivo no encontrado." }, 404);
      const { data: signed, error: signedError } = await admin.storage
        .from("memory-task-private").createSignedUrl(file.storage_path, 60, { download: file.name });
      if (signedError) throw signedError;
      const { error: auditError } = await admin.from("mt_admin_audit").insert({
        actor_id: actorId,
        target_user_id: typeof body.userId === "string" ? body.userId : null,
        action: "private_file_access_link_created",
        details: { file_id: file.id, file_name: file.name, expires_in_seconds: 60 },
      });
      if (auditError) throw auditError;
      return json({ signedUrl: signed.signedUrl, expiresInSeconds: 60 });
    }

    if (action === "set_role") {
      if (actorRole !== "super_admin") return json({ error: "Solo el administrador principal puede cambiar roles." }, 403);
      const targetId = typeof body.userId === "string" ? body.userId : "";
      const nextRole = body.role;
      if (!targetId || !["admin", "user"].includes(nextRole)) {
        return json({ error: "Usuario o rol no válido." }, 400);
      }
      if (targetId === principalId) return json({ error: "El administrador principal no puede ser degradado." }, 400);
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetId);
      if (targetError || !target.user) return json({ error: "Usuario no encontrado." }, 404);

      const { error: writeError } = await admin.from("mt_user_roles").upsert({
        user_id: targetId, role: nextRole, granted_by: actorId, updated_at: new Date().toISOString(),
      });
      if (writeError) throw writeError;
      const { error: auditError } = await admin.from("mt_admin_audit").insert({
        actor_id: actorId, target_user_id: targetId, action: "role_changed",
        details: { role: nextRole },
      });
      if (auditError) throw auditError;
      return json({ success: true, userId: targetId, role: nextRole });
    }

    if (action === "audit_log") {
      const { data, error } = await admin.from("mt_admin_audit")
        .select("id,actor_id,target_user_id,action,details,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json({ entries: data ?? [] });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (error) {
    console.error("admin-console:", error);
    return json({ error: "No se pudo completar la operación administrativa." }, 500);
  }
});
