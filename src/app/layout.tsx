import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { TenantSessionProvider } from "@/lib/TenantSessionContext";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Taj AssetFlow | IT Inventory",
  description: "IT Inventory Management System for Taj Gasoline",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const isLoginPage = !session;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              const saved = localStorage.getItem('color_theme') || 'blue';
              const themes = {
                blue: 'oklch(0.45 0.18 250)',
                default: 'oklch(0.35 0.12 340)',
                emerald: 'oklch(0.50 0.16 162)',
                violet: 'oklch(0.48 0.22 292)',
                amber: 'oklch(0.65 0.18 70)',
              };
              const fgs = {
                blue: 'oklch(0.985 0 0)',
                default: 'oklch(0.985 0 0)',
                emerald: 'oklch(0.985 0 0)',
                violet: 'oklch(0.985 0 0)',
                amber: 'oklch(0.145 0 0)',
              };
              const theme = themes[saved];
              const fg = fgs[saved];
              if (theme) {
                document.documentElement.style.setProperty('--primary', theme);
                document.documentElement.style.setProperty('--primary-foreground', fg);
                document.documentElement.style.setProperty('--ring', theme);
              }
            } catch (e) {}
          })();
        ` }} />
      </head>
      <body className={`${inter.className} antialiased bg-background text-foreground flex`}>
        <TenantSessionProvider>
          <ToastProvider />
          {!isLoginPage && <Sidebar userRole={session?.role} />}
          <main className={`flex-1 min-h-screen bg-muted/20 ${!isLoginPage ? 'ml-64 max-w-[calc(100vw-16rem)]' : 'w-full max-w-[100vw]'} overflow-x-hidden`}>
            <div className="p-4 sm:p-8 w-full max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </TenantSessionProvider>
      </body>
    </html>
  );
}
