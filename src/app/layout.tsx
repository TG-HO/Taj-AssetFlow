import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Taj AssetFlow | IT Inventory",
  description: "IT Inventory Management System for Taj Gasoline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-background text-foreground flex`}>
        <Sidebar />
        <main className="flex-1 ml-64 min-h-screen bg-muted/20 max-w-[calc(100vw-16rem)] overflow-x-hidden">
          <div className="p-4 sm:p-8 w-full max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
