"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT_STYLE: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--color-accent)",
    color: "var(--color-accent-text)",
    border: "none",
  },
  secondary: {
    background: "var(--color-bg-secondary)",
    color: "var(--color-text)",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-accent)",
    border: "none",
  },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  fullWidth,
  style,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        ...VARIANT_STYLE[variant],
        width: fullWidth ? "100%" : undefined,
        padding: "12px 20px",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-base)",
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s ease, transform 0.1s ease",
        ...style,
      }}
      onPointerDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = "scale(0.98)";
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    />
  );
}
