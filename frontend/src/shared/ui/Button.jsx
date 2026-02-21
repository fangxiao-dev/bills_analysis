/**
 * Shared button component with visual variants.
 * @param {{
 *  children: import("react").ReactNode;
 *  variant?: "primary" | "ghost" | "danger" | "success";
 *  className?: string;
 * } & import("react").ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({ children, variant = "primary", className = "", ...rest }) {
  const variantClass =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-700"
      : variant === "danger"
        ? "bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
        : variant === "success"
          ? "bg-green-600 text-white hover:bg-green-700 border-green-700"
          : "bg-white text-ledger-ink hover:bg-slate-50 border-ledger-line";

  return (
    <button
      className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variantClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
