import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import AppShell from "@/components/AppShell";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ARASE",
  description: "Automated IEP and Assessment Generation Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <AuthProvider>
          <Toaster position="top-right" richColors closeButton />
          <div className="flex flex-col h-screen overflow-hidden w-full">
            <div className="shrink-0">
              <Navbar />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden w-full">
              <AppShell>
                {children}
              </AppShell>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
