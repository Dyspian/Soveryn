const PATHS = [
  "M16 44c8-18 24-18 32 0",
  "M20 28h24",
  "M24 20h16",
  "M18 36c6-8 22-8 28 0",
  "M16 24c8 10 24 10 32 0",
  "M22 18v20M42 18v20",
];

export function Portrait({ portraitKey, className = "h-16 w-16" }: { portraitKey: string; className?: string }) {
  const index = Number(portraitKey.replace("mark-", "")) - 1;
  const path = PATHS[index] ?? PATHS[0];
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Character portrait">
      <rect width="64" height="64" rx="8" fill="#1e2126" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#c4a15a" strokeWidth="2" />
      <path d={path} fill="none" stroke="#e6e2d8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
