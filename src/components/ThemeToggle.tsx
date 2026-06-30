export default function ThemeToggle() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--ink)] shadow-[0_8px_22px_rgba(0,0,0,0.3)]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--interactive)]" />
      SOC Dark
    </span>
  )
}
