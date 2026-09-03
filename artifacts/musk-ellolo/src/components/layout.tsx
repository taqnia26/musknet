import { Navbar } from './navbar';
import { Footer } from './footer';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] w-full min-w-0 flex-col overflow-x-clip">
      <Navbar />
      <main className="flex w-full min-w-0 flex-1 flex-col">
        {children}
      </main>
      <Footer />
    </div>
  );
}
