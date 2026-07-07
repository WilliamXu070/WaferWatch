import type { Metadata, Viewport } from "next";
import "react-calendar-timeline/style.css";
import "./globals.css";
import "@/components/process-dashboard/calendar/calendar.css";

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
      <body>{children}</body>
    </html>
  );
}
