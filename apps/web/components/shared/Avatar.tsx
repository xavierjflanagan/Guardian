'use client';

import { useState } from 'react';
import type { Profile } from '@/app/providers/ProfileProvider';

interface AvatarProps {
  profile: Profile | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm', 
  lg: 'w-12 h-12 text-base'
};

const getInitials = (profile: Profile | null): string => {
  if (!profile) return '?';
  
  // Use display_name to generate initials
  const name = profile.display_name?.trim();
  if (!name) return '?';
  
  // Handle edge case: emoji/special characters (fallback to first character)
  const cleanName = name.replace(/[^\w\s]/g, '').trim();
  if (!cleanName) {
    // If no alphanumeric characters, use first character of original name
    return name[0] || '?';
  }
  
  const names = cleanName.split(/\s+/).filter(n => n.length > 0);
  if (names.length >= 2) {
    return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
  }
  return names[0]?.[0]?.toUpperCase() || '?';
};

const getProfileColor = (profile: Profile | null): string => {
  if (!profile) return 'bg-gray-400';
  
  // Default colors based on profile type
  const typeColors = {
    'self': 'bg-blue-500',
    'child': 'bg-green-500', 
    'pet': 'bg-orange-500',
    'dependent': 'bg-purple-500'
  };
  
  return typeColors[profile.profile_type as keyof typeof typeColors] || 'bg-gray-500';
};

export function Avatar({ profile, size = 'md', className = '' }: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  const initials = getInitials(profile);
  const colorClass = getProfileColor(profile);
  const sizeClass = sizeClasses[size];
  
  // For now, we'll only show initials (no avatar_url in Profile type yet)
  const showImage = false; // profile?.avatar_url && !imageError;
  
  return (
    <div className={`relative flex items-center justify-center rounded-full font-semibold text-white ${sizeClass} ${colorClass} ${className}`}>
      {showImage && (
        <img
          src={''} // profile.avatar_url when added to Profile type
          alt={profile?.display_name || 'Profile'}
          className={`rounded-full object-cover ${sizeClass} ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setImageLoading(false)}
          onError={() => {
            setImageError(true);
            setImageLoading(false);
          }}
        />
      )}
      
      {(!showImage || imageLoading) && (
        <span className="select-none">
          {initials}
        </span>
      )}
      
      {/* Online status indicator for future use */}
      {profile && (
        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-white opacity-0">
        </div>
      )}
    </div>
  );
}