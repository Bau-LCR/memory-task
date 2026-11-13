import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Configuración del servidor incompleta." }, 500);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sesión requerida." }, 401);
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sesión inválida o vencida." }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const { data: docs, error: docsError } = await admin.from("mt_legal_documents")
      .select("document_type,version,title,content,published_at").order("published_at", { ascending: false });
    if (docsError) throw docsError;
    const latest = new Map<string, any>();
    for (const doc of docs ?? []) if (!latest.has(doc.document_type)) latest.set(doc.document_type, doc);
    const terms = latest.get("terms");
    const privacy = latest.get("privacy");
    if (!terms || !privacy) return json({ error: "Los documentos legales todavía no están publicados." }, 503);

    if (body?.action === "admin_access_log") {
      const { data, error } = await admin.from("mt_admin_audit")
        .select("action,details,created_at")
        .eq("target_user_id", authData.user.id)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return json({ entries: data ?? [] });
    }

    if (body?.action === "status") {
      const { data: acceptance, error } = await admin.from("mt_legal_acceptances")
        .select("terms_version,privacy_version,accepted_at")
        .eq("user_id", authData.user.id).maybeSingle();
      if (error) throw error;
      const accepted = acceptance?.terms_version === terms.version && acceptance?.privacy_version === privacy.version;
      return json({ required: !accepted, acceptedAt: acceptance?.accepted_at ?? null, terms, privacy });
    }

    if (body?.action === "accept") {
      if (body.termsVersion !== terms.version || body.privacyVersion !== privacy.version) {
        return json({ error: "Los documentos cambiaron. Actualizá la página y revisalos nuevamente." }, 409);
      }
      const { error } = await admin.from("mt_legal_acceptances").upsert({
        user_id: authData.user.id,
        terms_version: terms.version,
        privacy_version: privacy.version,
        accepted_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      return json({ accepted: true, acceptedAt: new Date().toISOString() });
    }
    return json({ error: "Acción desconocida." }, 400);
  } catch (error) {
    console.error("account-consent:", error);
    return json({ error: "No se pudo verificar el consentimiento de la cuenta." }, 500);
  }
});
