import {
  Bike,
  Briefcase,
  CalendarCheck,
  Coffee,
  CreditCard,
  Gift,
  GraduationCap,
  Heart,
  House,
  Mountain,
  PartyPopper,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  TrendingDown,
  TriangleAlert,
  Tv,
  Users,
  Utensils,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { EventTone, IconName } from "@/game/types";
import { cn } from "@/lib/utils";

const ICONS: Record<IconName, LucideIcon> = {
  wallet: Wallet,
  coffee: Coffee,
  bike: Bike,
  "shopping-bag": ShoppingBag,
  smartphone: Smartphone,
  users: Users,
  alert: TriangleAlert,
  home: House,
  utensils: Utensils,
  mountain: Mountain,
  sparkles: Sparkles,
  "piggy-bank": PiggyBank,
  party: PartyPopper,
  briefcase: Briefcase,
  "credit-card": CreditCard,
  heart: Heart,
  gift: Gift,
  wrench: Wrench,
  tv: Tv,
  plane: Plane,
  graduation: GraduationCap,
  pill: Pill,
  receipt: Receipt,
  "trending-down": TrendingDown,
  calendar: CalendarCheck,
};

export const TONE_TEXT: Record<EventTone, string> = {
  good: "text-money",
  bad: "text-alert",
  neutral: "text-happy",
};

const TONE_BG: Record<EventTone, string> = {
  good: "bg-money/12 ring-money/25",
  bad: "bg-alert/12 ring-alert/25",
  neutral: "bg-happy/12 ring-happy/25",
};

export function EventIcon({ name, tone, className }: { name: IconName; tone: EventTone; className?: string }) {
  const Icon = ICONS[name];
  return (
    <div className={cn("grid place-items-center size-12 rounded-2xl ring-1", TONE_BG[tone], className)}>
      <Icon className={cn("size-6", TONE_TEXT[tone])} aria-hidden />
    </div>
  );
}
