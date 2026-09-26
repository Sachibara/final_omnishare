import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const shareId = String(body?.shareId || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    const action = body?.action === "download" ? "download" : "info";

    if (!/^OMNI-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(shareId)) {
      return json({ error: "Invalid OmniShare ID." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const secretJson = Deno.env.get("SUPABASE_SECRET_KEYS");
    const legacyService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const secret = secretJson ? JSON.parse(secretJson)?.default : legacyService;

    if (!url || !secret) return json({ error: "Server configuration unavailable." }, 500);

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: file, error: lookupError } = await admin
      .from("omnishare_files")
      .select("id,owner_id,share_id,storage_path,original_name,size_bytes,mime_type,note,created_at,expires_at,download_count")
      .eq("share_id", shareId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!file) return json({ error: "File not found." }, 404);

    if (file.expires_at && new Date(file.expires_at).getTime() <= Date.now()) {
      return json({ error: "This file has expired." }, 410);
    }

    const publicFile = {
      id: file.id,
      shareId: file.share_id,
      name: file.original_name,
      size: file.size_bytes,
      type: file.mime_type,
      note: file.note,
      createdAt: file.created_at,
      expiresAt: file.expires_at,
      downloadCount: Number(file.download_count || 0),
    };

    if (action === "info") {
      return json({ file: publicFile });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from("omnishare-files")
      .createSignedUrl(file.storage_path, 120, { download: true });

    if (signedError || !signed?.signedUrl) {
      throw signedError || new Error("Unable to create download URL.");
    }

    const nextCount = Number(file.download_count || 0) + 1;

    await admin
      .from("omnishare_files")
      .update({ download_count: nextCount, last_downloaded_at: new Date().toISOString() })
      .eq("id", file.id);

    await admin.from("omnishare_activity").insert({
      owner_id: file.owner_id,
      file_id: file.id,
      event_type: "download",
      share_id: file.share_id,
      file_name: file.original_name,
      detail: { source: "public_retrieval" },
    });

    return json({
      file: { ...publicFile, downloadCount: nextCount },
      signedUrl: signed.signedUrl,
      validForSeconds: 120,
    });
  } catch (error) {
    console.error("omnishare-retrieve", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});