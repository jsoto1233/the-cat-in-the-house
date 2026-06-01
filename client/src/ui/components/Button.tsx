import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button className={`btn btn--${variant} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
