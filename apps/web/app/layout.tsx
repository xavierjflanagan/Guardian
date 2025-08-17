import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Shell } from "@/components/shell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: process.env.NODE_ENV === 'development' || process.env.VERCEL_GIT_COMMIT_REF === 'staging' 
    ? "Guardian [STAGING]" 
    : "Guardian",
  description: "AI-powered healthcare application - secure deployment",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning={true}>
        <Providers>
          <Shell>
            {children}
          </Shell>
        </Providers>
      </body>
    </html>
  );
}
