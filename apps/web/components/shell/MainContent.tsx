'use client';

import { ReactNode } from 'react';

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  return (
    <main className="guardian-main flex-1 overflow-auto">
      <div className="h-full">
        {children}
      </div>
    </main>
  );
}