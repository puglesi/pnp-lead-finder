import { CheckCircle2, MailX } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EmailStatusProps {
  email: string | null;
  className?: string;
}

export function EmailStatus({ email, className }: EmailStatusProps) {
  if (email) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/15",
              className
            )}
          >
            <CheckCircle2 className="size-3.5 text-emerald-400" />
          </span>
        </TooltipTrigger>
        <TooltipContent>Email validado</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full bg-muted",
            className
          )}
        >
          <MailX className="size-3.5 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Email não encontrado</TooltipContent>
    </Tooltip>
  );
}