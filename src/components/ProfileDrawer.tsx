import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Camera, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const OUTPUT_SIZE = 512;
const JPEG_QUALITY = 0.85;
const FRAME_SIZE = 320; // px in the cropper UI

interface CropState {
  // Pan offsets (px in display coords), zoom (multiplier of base "cover" scale)
  x: number;
  y: number;
  zoom: number;
}

function AvatarCropDialog({
  src,
  onCancel,
  onConfirm,
}: {
  src: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => {
      imgRef.current = i;
      setImg(i);
      setCrop({ x: 0, y: 0, zoom: 1 });
    };
    i.src = src;
  }, [src]);

  // Base scale = "cover" the frame with the image, then zoom multiplies.
  const baseScale = img ? Math.max(FRAME_SIZE / img.width, FRAME_SIZE / img.height) : 1;
  const drawW = img ? img.width * baseScale * crop.zoom : 0;
  const drawH = img ? img.height * baseScale * crop.zoom : 0;

  // Clamp pan so the image always covers the frame
  const clamp = (next: CropState): CropState => {
    if (!img) return next;
    const w = img.width * baseScale * next.zoom;
    const h = img.height * baseScale * next.zoom;
    const maxX = Math.max(0, (w - FRAME_SIZE) / 2);
    const maxY = Math.max(0, (h - FRAME_SIZE) / 2);
    return {
      zoom: next.zoom,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: crop.x, oy: crop.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setCrop((c) => clamp({ ...c, x: dragRef.current!.ox + dx, y: dragRef.current!.oy + dy }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onZoom = (z: number) => {
    setCrop((c) => clamp({ ...c, zoom: z }));
  };

  const handleConfirm = async () => {
    if (!img) return;
    // Map the visible frame back to source-image pixel coords.
    // Source pixel size of the frame at current zoom:
    const srcFrame = FRAME_SIZE / (baseScale * crop.zoom);
    const srcCx = img.width / 2 - crop.x / (baseScale * crop.zoom);
    const srcCy = img.height / 2 - crop.y / (baseScale * crop.zoom);
    const sx = srcCx - srcFrame / 2;
    const sy = srcCy - srcFrame / 2;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Canvas unavailable.");
      return;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, srcFrame, srcFrame, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) {
      toast.error("Could not export image.");
      return;
    }
    onConfirm(blob);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative bg-black select-none touch-none overflow-hidden"
            style={{ width: FRAME_SIZE, height: FRAME_SIZE, borderRadius: 8 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {img && (
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  width: drawW,
                  height: drawH,
                  left: (FRAME_SIZE - drawW) / 2 + crop.x,
                  top: (FRAME_SIZE - drawH) / 2 + crop.y,
                  maxWidth: "none",
                  cursor: "grab",
                }}
              />
            )}
            {/* Circular overlay */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                boxShadow: `0 0 0 9999px rgba(0,0,0,0.55)`,
                borderRadius: "50%",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ border: "1px solid rgba(255,255,255,0.4)" }}
            />
          </div>

          <div className="w-full flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={crop.zoom}
              onChange={(e) => onZoom(Number(e.target.value))}
              className="flex-1 accent-foreground"
            />
          </div>
          <p className="text-xs text-muted-foreground">Drag to position. Output is a 512×512 square.</p>
        </div>
        <DialogFooter>
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!img}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            Save photo
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProfileDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, profile, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    if (open) setName(profile?.full_name ?? "");
  }, [open, profile?.full_name]);

  // Revoke object URL when cropper closes
  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const initials = (profile?.full_name || profile?.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (!user) return;
    setCropSrc(null);
    setUploading(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: pub.publicUrl })
        .eq("id", user.id);
      if (updErr) throw updErr;
      await refresh();
      toast.success("Profile photo updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success("Name updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    onOpenChange(false);
    navigate({ to: "/login" });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle>Your profile</SheetTitle>
          <SheetDescription>Update your photo and name.</SheetDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="relative w-28 h-28 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center group"
              aria-label="Change profile photo"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-medium text-foreground">{initials}</span>
              )}
              <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs gap-1">
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-4 h-4" /> Change
                  </>
                )}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <p className="text-xs text-muted-foreground">JPG or PNG. You'll position and crop next.</p>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleSaveName}
              disabled={saving || (name.trim() === (profile?.full_name ?? "").trim())}
              className="mt-1 w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save name
            </button>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <div className="w-full bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm text-muted-foreground">
              {profile?.email ?? user?.email}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-6 py-4">
          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border text-foreground px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </SheetContent>

      {cropSrc && (
        <AvatarCropDialog
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </Sheet>
  );
}
