import type { Metadata } from "next";
import "react-calendar-timeline/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "WaferWatch",
  description: "Backend architecture for wafer fabrication tracking and cycle-time metrics."
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
