import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function getScoreMeta(score: number) {
  if (score >= 85)
    return {
      label: "Alto",
      desc: "Lead altamente qualificado",
      dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
      bg: "from-emerald-500/25 via-emerald-500/10 to-transparent",
      text: "text-emerald-300",
      border: "border-emerald-500/50",
      glow: "shadow-emerald-500/10",
    };
  if (score >= 70)
    return {
      label: "Médio",
      desc: "Lead com potencial moderado",
      dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
      bg: "from-amber-500/25 via-amber-500/10 to-transparent",
      text: "text-amber-300",
      border: "border-amber-500/50",
      glow: "shadow-amber-500/10",
    };
  return {
    label: "Baixo",
    desc: "Lead com baixa confiança",
    dot: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]",
    bg: "from-red-500/25 via-red-500/10 to-transparent",
    text: "text-red-300",
    border: "border-red-500/50",
    glow: "shadow-red-500/10",
  };
}

export function ScoreBadge({ score }: { score: number }) {
  const meta = getScoreMeta(score);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-gradient-to-r px-2.5 py-1.5 text-xs font-bold shadow-sm",
            meta.bg,
            meta.text,
            meta.border,
            meta.glow
          )}
        >
          <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
          <span className="tabular-nums">{score}</span>
          <span className="hidden text-[10px] font-medium opacity-80 sm:inline">
            {meta.label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">Score IA: {score} — {meta.label}</p>
        <p className="opacity-80">{meta.desc}</p>
      </TooltipContent>
    </Tooltip>
  );
}