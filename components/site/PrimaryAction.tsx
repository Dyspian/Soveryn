import Link from "next/link";

export function PrimaryAction({
  href,
  children,
  emphasis = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  emphasis?: "primary" | "secondary";
  className?: string;
}) {
  const tone = emphasis === "primary" ? "btn-primary" : "btn-secondary";
  return (
    <Link href={href} className={`btn min-h-11 px-4 ${tone} ${className}`}>
      {children}
    </Link>
  );
}
