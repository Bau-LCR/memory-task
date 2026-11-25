import { createClient } from "npm:@supabase/supabase-js@2";

const CUTREAL_URL = "https://vdgfrrdseqimbelgzsek.supabase.co";
const CUTREAL_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkZ2ZycmRzZXFpbWJlbGd6c2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1OTcxNzksImV4cCI6MjExMDE3MzE3OX0.xXOWUzuwG3PeOjtCse0JtMy4WoEYkEjMHhBX-Kc4vyw";
const ACCOUNT_ID = "6b76aa12-3832-4fa2-b1bf-1182b8b5da20";
const APP_ID = "89d81433-9b35-4ebf-9c9a-d5197d8bc239";
const GLOBAL_USER = "cutreal-neural-global";
const ALLOWED_ORIGINS = new Set(["https://bau-lcr.github.io", "http://localhost:5173", "http://127.0.0.1:5173"]);

function headers(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://bau-lcr.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function reply(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}
function cleanKey(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(value)) throw new Error("Identificador de memoria inválido.");
  return value.startsWith("neural-") ? value : "neural-" + value;
}
function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

async function getUsedBytes(db: any) {
  let total = 0;
  for (let offset = 0; offset < 100000; offset += 1000) {
    const page = await db.from('mt_service_objects').select('size_bytes')
      .eq('account_id', ACCOUNT_ID).order('created_at', { ascending: true }).range(offset, offset + 999);
    if (page.error) throw page.error;
    const rows = page.data ?? [];
    total += rows.reduce((sum: number, row: any) => sum + Number(row.size_bytes || 0), 0);
    if (rows.length < 1000) break;
  }
  return total;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return reply(req, { error: "Método no permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return reply(req, { error: "Falta la sesión de Cut-real." }, 401);

    // El gateway JWT está desactivado para aceptar el token de Cut-real.
    // La identidad y el rol se verifican aquí contra el proyecto de Cut-real.
    const identity = createClient(CUTREAL_URL, CUTREAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + token } },
    });
    const { data: userResult, error: userError } = await identity.auth.getUser(token);
    const user = userResult?.user;
    if (userError || !user) return reply(req, { error: "La sesión de Cut-real no es válida o venció." }, 401);

    const { data: roleRow, error: roleError } = await identity
      .from("cr_user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleError || !["owner", "admin"].includes(String(roleRow?.role ?? ""))) {
      return reply(req, { error: "El Laboratorio neuronal requiere una cuenta administradora." }, 403);
    }

    const mtUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!mtUrl || !serviceKey) return reply(req, { error: "El servicio de almacenamiento de Memory Task no está configurado." }, 503);
    const db = createClient(mtUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    async function upsertRecord(keyValue: unknown, categoryValue: unknown, payload: unknown, externalUserId: string) {
      const key = cleanKey(keyValue);
      const category = ["chat", "document", "custom"].includes(String(categoryValue)) ? String(categoryValue) : "custom";
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("El contenido de la memoria debe ser un objeto.");
      const size = jsonBytes(payload);
      if (size > 240000) throw new Error("El registro supera el máximo de 240 KiB.");
      const lookup = await db.from("mt_service_objects").select("id,size_bytes")
        .eq("account_id", ACCOUNT_ID).eq("app_id", APP_ID)
        .eq("external_user_id", externalUserId).eq("object_key", key).maybeSingle();
      if (lookup.error) throw lookup.error;
      const used = await getUsedBytes(db);
      const account = await db.from("mt_service_accounts").select("quota_bytes").eq("id", ACCOUNT_ID).single();
      if (account.error) throw account.error;
      const projected = used - Number(lookup.data?.size_bytes || 0) + size;
      if (projected > Number(account.data.quota_bytes)) throw new Error("Se agotó la cuota de almacenamiento de Memory Task.");
      const values = {
        account_id: ACCOUNT_ID, app_id: APP_ID, external_user_id: externalUserId,
        object_type: "record", object_key: key, object_category: category,
        payload, size_bytes: size, content_type: "application/json", updated_at: new Date().toISOString(),
      };
      if (lookup.data?.id) {
        const result = await db.from("mt_service_objects").update(values).eq("id", lookup.data.id);
        if (result.error) throw result.error;
        return { id: lookup.data.id, key, size };
      }
      const result = await db.from("mt_service_objects").insert(values).select("id").single();
      if (result.error) throw result.error;
      return { id: result.data.id, key, size };
    }

    if (action === "list" || action === "stats") {
      const [listed, account] = await Promise.all([
        action === "list"
          ? db.from("mt_service_objects").select("id,external_user_id,object_key,object_category,payload,size_bytes,created_at,updated_at")
              .eq("account_id", ACCOUNT_ID).eq("app_id", APP_ID)
              .in("external_user_id", [user.id, GLOBAL_USER]).order("updated_at", { ascending: false }).limit(1000)
          : Promise.resolve({ data: [], error: null }),
        db.from("mt_service_accounts").select("quota_bytes").eq("id", ACCOUNT_ID).single(),
      ]);
      if (listed.error) throw listed.error;
      if (account.error) throw account.error;
      const usedBytes = await getUsedBytes(db);
      const quotaBytes = Number(account.data.quota_bytes || 0);
      return reply(req, {
        records: listed.data ?? [], count: listed.data?.length ?? 0,
        storage: { usedBytes, quotaBytes, percent: quotaBytes ? usedBytes / quotaBytes * 100 : 0 },
      });
    }

    if (action === "put") {
      const shared = body.shared === true;
      const result = await upsertRecord(body.key, body.category, body.data, shared ? GLOBAL_USER : user.id);
      return reply(req, { ok: true, record: result });
    }

    if (action === "put_batch") {
      if (!Array.isArray(body.records) || body.records.length > 50) return reply(req, { error: "El lote admite hasta 50 registros." }, 400);
      const results = [];
      for (const item of body.records) {
        const shared = item?.shared === true;
        results.push(await upsertRecord(item?.key, item?.category, item?.data, shared ? GLOBAL_USER : user.id));
      }
      return reply(req, { ok: true, stored: results.length, records: results });
    }

    if (action === "sync") {
      if (!Array.isArray(body.records) || body.records.length > 50) return reply(req, { error: "El lote admite hasta 50 conversaciones." }, 400);
      let stored = 0, bytes = 0;
      for (const item of body.records) {
        const id = String(item?.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
        const question = typeof item?.question === "string" ? item.question.slice(0, 6000) : "";
        if (!id || !question) continue;
        const payload = {
          title: question.slice(0, 140),
          content: "Señal de entrada del usuario: " + question,
          source: "Cut-real 2 · señal privada de conversación",
          kind: "chat-signal",
          intent: String(item?.intent ?? "general").slice(0, 40),
          created_at: String(item?.createdAt ?? new Date().toISOString()),
        };
        const result = await upsertRecord("chat-" + id, "chat", payload, user.id);
        stored++; bytes += result.size;
      }
      return reply(req, { ok: true, stored, bytes });
    }

    if (action === "delete") {
      const key = cleanKey(body.key);
      const externalUserId = body.shared === true ? GLOBAL_USER : user.id;
      const result = await db.from("mt_service_objects").delete().eq("account_id", ACCOUNT_ID)
        .eq("app_id", APP_ID).eq("external_user_id", externalUserId).eq("object_key", key).select("id");
      if (result.error) throw result.error;
      return reply(req, { ok: true, deleted: (result.data ?? []).length > 0 });
    }

    return reply(req, { error: "Acción desconocida." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno de Memory Task.";
    return reply(req, { error: message.slice(0, 400) }, 500);
  }
});
