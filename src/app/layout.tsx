import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

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
    <html lang="en">
      <body className={`${inter.className} antialiased bg-background text-foreground flex`}>
        {!isLoginPage && <Sidebar userRole={session?.role} />}
        <main className={`flex-1 min-h-screen bg-muted/20 ${!isLoginPage ? 'ml-64 max-w-[calc(100vw-16rem)]' : 'w-full max-w-[100vw]'} overflow-x-hidden`}>
          <div className="p-4 sm:p-8 w-full max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
