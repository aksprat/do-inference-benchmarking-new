import { MODELS } from "@/lib/models";

export const PALETTE = [
  "#00c2ff",
  "#0069ff",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
];

export const colorFor = (index: number) => PALETTE[index % PALETTE.length];

const LABELS: Record<string, string> = Object.fromEntries(
  MODELS.map((m) => [m.id, m.label]),
);

export const labelFor = (id: string) => LABELS[id] || id;
