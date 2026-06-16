import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ExternalLink } from "lucide-react";
import { getDataSheetsForSpec, getDataSheetSignedUrl } from "@/lib/dataSheets.functions";

type Sheet = {
  id: string;
  pdf_url: string | null;
  pdf_path: string | null;
  doc_type: string;
  vendor: string | null;
  product_name: string | null;
  title: string | null;
  created_at: string;
};

export default function AttachedDataSheets({ specId }: { specId: string }) {
  const listFn = useServerFn(getDataSheetsForSpec);
  const signFn = useServerFn(getDataSheetSignedUrl);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFn({ data: { specId } }).then((rows) => {
      if (!cancelled) setSheets(rows as Sheet[]);
    });
    return () => {
      cancelled = true;
    };
  }, [specId, listFn]);

  if (!sheets || sheets.length === 0) return null;

  const openSheet = async (id: string) => {
    const r = await signFn({ data: { sheetId: id } });
    if (r.url) window.open(r.url, "_blank", "noopener");
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Attached data sheets ({sheets.length})
        </p>
      </div>
      <ul className="space-y-1">
        {sheets.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="font-mono uppercase text-[10px] px-1 py-0.5 bg-secondary rounded text-muted-foreground mr-2">
                {s.doc_type}
              </span>
              <span className="text-foreground">
                {s.product_name || s.title || "(untitled)"}
              </span>
              {s.vendor && <span className="text-muted-foreground"> · {s.vendor}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {s.pdf_path ? (
                <button
                  onClick={() => openSheet(s.id)}
                  className="inline-flex items-center gap-1 text-[var(--accent-blue)] hover:underline"
                >
                  <FileText className="w-3 h-3" /> PDF
                </button>
              ) : s.pdf_url ? (
                <a
                  href={s.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-3 h-3" /> Source
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
