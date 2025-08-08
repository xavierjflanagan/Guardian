import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import ProfileSwitcher from "@/components/ProfileSwitcher";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Guardian",
  description: "An AI-powered healthcare application",
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
          <header className="w-full border-b border-gray-200">
            <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-end">
              <ProfileSwitcher />
            </div>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
