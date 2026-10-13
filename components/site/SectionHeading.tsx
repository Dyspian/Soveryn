export function SectionHeading({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="max-w-xl">
      <p className="kicker">{kicker}</p>
      <h2 id={id} className="mt-2 font-serif text-3xl leading-tight tracking-wide md:text-4xl">
        {title}
      </h2>
      {children ? <div className="mt-4 text-muted">{children}</div> : null}
    </header>
  );
}
