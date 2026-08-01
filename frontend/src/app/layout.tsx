import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/hooks/useNotifications";
import Navbar from "@/components/Navbar";
import AppShell from "@/components/AppShell";
import AppToaster from "@/components/AppToaster";
import RealtimeProvider from "@/components/RealtimeProvider";
import SkipToContent from "@/components/SkipToContent";
import AccessibilityLoader from "@/components/AccessibilityLoader";

export const metadata: Metadata = {
  title: "ARASE",
  description: "Automated IEP and Assessment Generation Platform",
};

// `viewportFit: "cover"` is what makes env(safe-area-inset-*) resolve to a real
// value — without it the insets are always 0 and the mobile bottom nav sits
// under the home indicator on notched devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          <AppToaster />
          <AccessibilityLoader />
          <NotificationProvider>
            <RealtimeProvider>
              <SkipToContent />
              {/* dvh, not vh — mobile browser chrome makes 100vh taller than the
                  visible viewport, which pushed the fixed bottom nav off-screen
                  with no way to scroll to it. */}
              <div className="flex flex-col h-[100dvh] overflow-hidden w-full">
                <div className="shrink-0 md:hidden">
                  <Navbar />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden w-full">
                  <AppShell>
                    {children}
                  </AppShell>
                </div>
              </div>
            </RealtimeProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
