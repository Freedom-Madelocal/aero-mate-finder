// Sends an email invitation to a new user via Supabase Auth admin API.
// Authorizes the caller as super_admin or org_admin of the target organization.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Missing auth" });

    // Identify caller using their JWT
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json(401, { error: "Invalid session" });
    const callerId = userData.user.id;

    const body = await req.json().catch(() => null);
    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const role = (body?.role ?? "").toString();
    const organization_id = (body?.organization_id ?? "").toString();
    const redirectTo = (body?.redirectTo ?? "").toString();

    if (!email || !role || !organization_id) {
      return json(400, { error: "email, role, organization_id required" });
    }
    const validRoles = ["super_admin", "org_admin", "engineer", "procurement", "dev", "integrator"];
    if (!validRoles.includes(role)) return json(400, { error: "Invalid role" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorize caller: super_admin OR org_admin of the same organization
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const roleSet = new Set((callerRoles ?? []).map((r: { role: string }) => r.role));
    const isSuper = roleSet.has("super_admin");

    if (!isSuper) {
      if (!roleSet.has("org_admin")) return json(403, { error: "Forbidden" });
      const { data: prof } = await admin
        .from("profiles")
        .select("organization_id")
        .eq("id", callerId)
        .maybeSingle();
      if (!prof || prof.organization_id !== organization_id) {
        return json(403, { error: "Forbidden" });
      }
    }

    // Track invite (best-effort)
    const token = crypto.randomUUID().replace(/-/g, "");
    await admin.from("org_invitations").insert({
      organization_id,
      email,
      role,
      token,
      invited_by: callerId,
    });

    // Try sending an invite email. If the user already exists in auth,
    // fall back to a password recovery email so they can (re)set a password
    // and finish their setup. This makes "Resend invite" work for both
    // pending and previously-invited users.
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { organization_id, role, invited_by: callerId },
      redirectTo: redirectTo || undefined,
    });

    if (inviteErr) {
      const msg = (inviteErr.message || "").toLowerCase();
      const alreadyExists =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists");
      if (alreadyExists) {
        const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, {
          redirectTo: redirectTo || undefined,
        });
        if (resetErr) return json(400, { error: resetErr.message || "Failed to resend" });
        return json(200, { ok: true, mode: "recovery" });
      }
      return json(400, { error: inviteErr.message || "Failed to send invite" });
    }

    return json(200, { ok: true, mode: "invite" });

  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Server error" });
  }
});
