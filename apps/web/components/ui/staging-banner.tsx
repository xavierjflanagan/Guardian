'use client';

import { useEffect, useState } from 'react';

export function StagingBanner() {
  const [isStaging, setIsStaging] = useState(false);

  useEffect(() => {
    // Check if we're in staging environment
    const staging = process.env.NODE_ENV === 'development' || 
                   window.location.hostname.includes('staging');
    setIsStaging(staging);
    
    // Add padding to body to account for banner
    if (staging) {
      document.body.style.paddingTop = '48px';
    }
    
    return () => {
      document.body.style.paddingTop = '';
    };
  }, []);

  if (!isStaging) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-yellow-400 to-orange-500 text-orange-900 px-4 py-3 text-center text-sm font-semibold shadow-lg">
      <div className="flex items-center justify-center gap-2">
        <span className="animate-pulse">🚧</span>
        <span>STAGING ENVIRONMENT - Development Version</span>
        <span className="animate-pulse">🚧</span>
      </div>
    </div>
  );
}