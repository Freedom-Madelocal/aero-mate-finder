import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

/*
 * StatusTooltip — Wraps any element with an explanatory tooltip.
 * Used across the platform to explain statuses, colors, badges, and abbreviations.
 * The tooltip content is always plain text with a max width for readability.
 */

interface StatusTooltipProps {
  content: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export default function StatusTooltip({ content, children, side = "top", className }: StatusTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center cursor-help ${className ?? ""}`}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
