"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, FlaskConical, TriangleAlert, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024; // a year of Kotak statement is ~100 KB

export interface PickedFile {
  name: string;
  text: string;
}

/**
 * Choose one or more CSVs. Files are read with File.text() in the browser; nothing is sent anywhere.
 * "Try a sample statement" loads a made-up statement bundled with the app.
 */
export function PickStep({ busy, error, onFiles }: { busy: boolean; error: string | null; onFiles: (files: PickedFile[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function read(list: FileList | File[]) {
    setLocalError(null);
    const files = [...list];
    if (!files.length) return;
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setLocalError(`${tooBig.name} is larger than 5 MB. Is it a statement CSV?`);
    onFiles(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))));
  }

  async function sample() {
    setLocalError(null);
    // The sample is a static file shipped with the app (made-up data): fetched, not uploaded.
    const text = await (await fetch("/sample-kotak-statement.csv")).text();
    onFiles([{ name: "sample-kotak-statement.csv", text }]);
  }

  const shown = localError ?? error;
  return (
    <div className="space-y-3">
      <label
        htmlFor="statement-files"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void read(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-6 text-center transition",
          dragging ? "border-money bg-money/10" : "border-white/15 bg-card hover:border-white/30",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <div className="grid size-14 place-items-center rounded-2xl bg-money/10">
          {busy ? <FileSpreadsheet className="size-7 animate-pulse text-money" /> : <Upload className="size-7 text-money" />}
        </div>
        <div className="text-lg font-semibold">{busy ? "Reading on your device…" : "Choose your Kotak CSV"}</div>
        <p className="max-w-xs text-sm text-muted-foreground text-pretty">
          Tap to pick one or more files, or drop them here. They&apos;re read in this browser and never uploaded.
        </p>
        <input
          ref={input}
          id="statement-files"
          type="file"
          accept=".csv,text/csv"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void read(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {shown && (
        <p role="alert" className="flex gap-2 rounded-2xl bg-alert/10 p-3 text-sm text-alert ring-1 ring-alert/30">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {shown}
        </p>
      )}

      <button
        type="button"
        onClick={sample}
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <FlaskConical className="size-4 text-goal" /> No statement handy? Try a sample
      </button>
    </div>
  );
}
