/**
 * Layout for the public PWA — buyer and seller surfaces.
 *
 * One user account can hold both buyer and seller capabilities under a single
 * identity, so these live together in one route group rather than being split.
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="font-semibold">Informal BNPL</span>
          <span className="text-xs text-black/50 dark:text-white/50">
            Buyer · Seller
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
