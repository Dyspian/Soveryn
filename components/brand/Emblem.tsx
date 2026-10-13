export function Emblem({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="108 30" />
      <path d="M32 8v48" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
