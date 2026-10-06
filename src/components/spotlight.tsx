"use client";
import type { ReactNode } from "react";

// Feeds the pointer position to CSS (--mx/--my, relative to this element) so
// the grid's borders and cards can glow around it. See .feature-grid in
// globals.css.
export function Spotlight({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      onPointerMove={(event) => {
        const element = event.currentTarget;
        const box = element.getBoundingClientRect();
        element.style.setProperty("--mx", `${event.clientX - box.left}px`);
        element.style.setProperty("--my", `${event.clientY - box.top}px`);
      }}
      onPointerLeave={(event) => {
        const style = event.currentTarget.style;
        style.removeProperty("--mx");
        style.removeProperty("--my");
      }}
    >
      {children}
    </div>
  );
}
