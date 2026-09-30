import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as adventurer from "@dicebear/adventurer";
import { cn } from "@/lib/utils";

export function TwinAvatar({ seed, className }: { seed: string; className?: string }) {
  const src = useMemo(() => createAvatar(adventurer, { seed }).toDataUri(), [seed]);
  return (
    <div
      className={cn(
        "relative aspect-square rounded-full bg-raised ring-1 ring-white/10 shadow-[0_20px_60px_-20px] shadow-money/30 overflow-hidden",
        className,
      )}
    >
      {/* SVG data URI rendered via <img> so it can't run scripts; next/image adds nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full scale-110 translate-y-[6%]" draggable={false} />
    </div>
  );
}
