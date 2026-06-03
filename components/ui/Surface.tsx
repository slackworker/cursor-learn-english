import type { ReactNode } from "react";

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
};

const paddingMap = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Surface({ children, className = "", padding = "md" }: SurfaceProps) {
  return (
    <div className={`surface ${paddingMap[padding]} ${className}`.trim()}>
      {children}
    </div>
  );
}

export function SurfaceMuted({ children, className = "", padding = "md" }: SurfaceProps) {
  return (
    <div className={`surface-muted ${paddingMap[padding]} ${className}`.trim()}>
      {children}
    </div>
  );
}
