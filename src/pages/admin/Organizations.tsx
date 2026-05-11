import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Org { id: string; name: string; slug: string; created_at: string; }

export default function AdminOrganizations() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading, user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => { if (!loading && !isSuperAdmin) navigate({ to: "/" }); }, [loading, isSuperAdmin, navigate]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });
    setOrgs((data as Org[]) ?? []);
  }, []);
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const _slug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await supabase.from("organizations").insert({ name: name.trim(), slug: _slug, created_by: user?.id });
    if (error) return toast.error(error.message);
    setName(""); setSlug(""); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete organization? Members will be unassigned.")) return;
    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) toast.error(error.message);
    load();
  };

  if (loading || !isSuperAdmin) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background p-6 sm:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Organizations</h1>
          <p className="text-sm text-muted-foreground">Create and manage tenant organizations.</p>
        </div>

        <form onSubmit={create} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <input value={name} required onChange={(e) => setName(e.target.value)}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Slug (optional)</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm" />
          </div>
          <button className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium">Create</button>
        </form>

        <div className="border border-border rounded-md divide-y divide-border">
          {orgs.map((o) => (
            <div key={o.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-muted-foreground">{o.slug} · {new Date(o.created_at).toLocaleDateString()}</div>
              </div>
              <button onClick={() => remove(o.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          ))}
          {orgs.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No organizations yet.</div>}
        </div>
      </div>
    </div>
  );
}
