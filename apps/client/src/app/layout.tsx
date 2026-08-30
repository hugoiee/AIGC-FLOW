import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "AIGC-FLOW",
  description: "画布节点工作流，用于调用各种模型进行影视资产创作",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={cn("min-h-dvh bg-background font-sans antialiased", geist.variable)}>
        {children}
      </body>
    </html>
  );
}
