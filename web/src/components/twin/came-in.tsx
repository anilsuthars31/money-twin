import { inr } from "@/game/engine";
import { cn } from "@/lib/utils";

/** What "Came in" is made of, when it's more than income: "₹9,500 income + ₹150 refunds & cashback + ₹300 from friends". */
export function CameInParts({ parts, className }: { parts: { label: string; amount: number }[]; className?: string }) {
  if (parts.length < 2) return null;
  return (
    <p className={cn("text-xs text-muted-foreground text-pretty", className)} data-testid="came-in-parts">
      Came in:{" "}
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 && " + "}
          <span className="num text-foreground">{inr(p.amount)}</span> {p.label}
        </span>
      ))}
    </p>
  );
}
