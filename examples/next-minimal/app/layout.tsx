import { Analytics } from "@konsfyi/analytics/next";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {children}
        <Analytics site="example.com" />
      </body>
    </html>
  );
}
