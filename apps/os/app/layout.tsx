import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "KXRA OS",
  description: "The KXRA Group venture operating system",
  icons: { icon: "/favicon.svg" },
};
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
