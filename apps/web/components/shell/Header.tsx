'use client';

import ProfileSwitcher from '@/components/ProfileSwitcher';

export function Header() {
  return (
    <header className="guardian-header bg-white border-b border-gray-200">
      <div className="h-16 px-6 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-xl font-semibold text-gray-900">Guardian</h1>
        </div>
        <div className="flex items-center space-x-4">
          <ProfileSwitcher />
        </div>
      </div>
    </header>
  );
}