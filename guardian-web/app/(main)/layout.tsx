import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guardian - Healthcare Management",
  description: "AI-powered healthcare application for managing medical records",
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Guardian</h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Add Supabase auth components here later */}
            </div>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
