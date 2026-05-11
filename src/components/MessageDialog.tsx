import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { OnlineMember } from "@/hooks/useOrgPresence";

interface DM {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recipient: OnlineMember | null;
}

export default function MessageDialog({ open, onOpenChange, recipient }: Props) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<DM[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const recipientId = recipient?.user_id ?? null;
  const orgId = profile?.organization_id ?? null;
  const recipientName =
    recipient?.full_name || recipient?.email || "Teammate";

  // Load conversation + subscribe to new messages
  useEffect(() => {
    if (!open || !user || !recipientId) return;

    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${user.id})`,
        )
        .order("created_at", { ascending: true })
        .limit(200);
      if (!active) return;
      if (error) {
        toast.error("Couldn't load messages");
        return;
      }
      setMessages((data as DM[]) ?? []);
      // Mark unread incoming as read
      await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", user.id)
        .eq("sender_id", recipientId)
        .is("read_at", null);
    })();

    const channel = supabase
      .channel(`dm-${[user.id, recipientId].sort().join("-")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const m = payload.new as DM;
          const isPair =
            (m.sender_id === user.id && m.recipient_id === recipientId) ||
            (m.sender_id === recipientId && m.recipient_id === user.id);
          if (!isPair) return;
          setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [open, user, recipientId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, open]);

  const send = async () => {
    const body = text.trim();
    if (!body || !user || !recipientId || !orgId || sending) return;
    setSending(true);
    const { error } = await supabase.from("direct_messages").insert({
      organization_id: orgId,
      sender_id: user.id,
      recipient_id: recipientId,
      content: body,
    });
    setSending(false);
    if (error) {
      toast.error(error.message || "Failed to send");
      return;
    }
    setText("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="relative">
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background" />
              <span className="w-7 h-7 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center text-[10px]">
                {recipient?.avatar_url ? (
                  <img src={recipient.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (recipientName).slice(0, 2).toUpperCase()
                )}
              </span>
            </span>
            <span>{recipientName}</span>
          </DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="h-80 overflow-auto px-4 py-3 space-y-2 bg-background">
          {messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-10">
              No messages yet. Say hi 👋
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap break-words ${
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-2 flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Message ${recipientName}…`}
            rows={1}
            className="flex-1 resize-none bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
          />
          <Button size="sm" onClick={send} disabled={!text.trim() || sending}>
            Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
