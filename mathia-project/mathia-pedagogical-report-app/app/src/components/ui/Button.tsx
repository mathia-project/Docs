import { splitProps, type Component, type JSX } from "solid-js";

import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-sm hover:bg-brand-strong focus-visible:outline-brand disabled:bg-brand/45",
  secondary:
    "border border-line bg-white text-ink shadow-sm hover:border-brand/35 hover:bg-brand-soft focus-visible:outline-brand",
  ghost: "text-ink-muted hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-brand",
  danger: "bg-danger text-white shadow-sm hover:bg-danger/90 focus-visible:outline-danger disabled:bg-danger/45",
};

export const Button: Component<ButtonProps> = (props) => {
  const [local, others] = splitProps(props, ["variant", "class", "children", "type"]);

  return (
    <button
      {...others}
      type={local.type ?? "button"}
      class={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
        variants[local.variant ?? "primary"],
        local.class,
      )}
    >
      {local.children}
    </button>
  );
};
