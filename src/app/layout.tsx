import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WaferWatch",
  description: "Backend architecture for wafer fabrication tracking and cycle-time metrics."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        data-perf-test-mode={process.env.PERF_TEST_MODE === "1" ? "1" : undefined}
        data-focus-recovery-ms={process.env.PERF_TEST_MODE === "1" ? "1000" : undefined}
      >
        {children}
      </body>
    </html>
  );
}
