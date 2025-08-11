'use client';

import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="guardian-shell">
      <Header />
      <Sidebar />
      <MainContent>
        {children}
      </MainContent>
    </div>
  );
}