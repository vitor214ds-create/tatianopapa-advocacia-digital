import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/Reveal";

interface SectionProps {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "light" | "offwhite" | "navy";
}

export function Section({ id, children, className, tone = "light" }: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-28 px-4 py-16 sm:px-6 lg:py-24",
        tone === "offwhite" && "bg-offwhite",
        tone === "navy" && "surface-navy",
        className,
      )}
    >
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

interface HeadingProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  align?: "left" | "center";
  tone?: "light" | "dark";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  tone = "light",
  className,
}: HeadingProps) {
  return (
    <Reveal
      className={cn(
        "max-w-3xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className,
      )}
    >
      {eyebrow && (
        <p className={cn("eyebrow", tone === "dark" ? "text-primary-foreground/60" : "text-accent")}>{eyebrow}</p>
      )}
      <h2
        className={cn(
          "mt-3 font-display text-3xl leading-tight sm:text-4xl lg:text-[2.6rem]",
          tone === "dark" ? "text-primary-foreground" : "text-primary",
        )}
      >
        {title}
      </h2>
      {description && (
        <div
          className={cn(
            "mt-5 space-y-4 text-base leading-relaxed",
            tone === "dark" ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {description}
        </div>
      )}
    </Reveal>
  );
}

export function Disclaimer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-10 text-center text-xs leading-relaxed text-muted-foreground/90", className)}>{children}</p>
  );
}
