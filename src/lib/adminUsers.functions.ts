import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLES = ["super_admin", "org_admin", "engineer", "procurement", "dev", "integrator"] as const;

export const createUserWithPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(255),
        password: z.string().min(6).max(128),
        full_name: z.string().max(255).optional(),
        organization_id: z.string().uuid().nullable().optional(),
        role: z.enum(ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Verify caller is super_admin
    const { data: callerRoles, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    if (!(callerRoles ?? []).some((r) => r.role === "super_admin")) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase().trim(),
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name ?? null,
        organization_id: data.organization_id ?? null,
        role: data.role,
      },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create user");
    }

    const uid = created.user.id;

    // Ensure profile + role rows exist (trigger may have run, but be defensive)
    await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: uid,
          email: data.email.toLowerCase().trim(),
          full_name: data.full_name ?? null,
          organization_id: data.organization_id ?? null,
        },
        { onConflict: "id" },
      );

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: uid, role: data.role }, { onConflict: "user_id,role" });

    return { user_id: uid };
  });
