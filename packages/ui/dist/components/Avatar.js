'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
// Size configurations following Guardian design system
const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg'
};
// Generate initials with improved edge case handling
const getInitials = (profile, fallback) => {
    if (!profile)
        return fallback || '?';
    // Use display_name to generate initials
    const name = profile.display_name?.trim();
    if (!name)
        return fallback || '?';
    // Handle edge case: emoji/special characters (fallback to first character)
    const cleanName = name.replace(/[^\w\s]/g, '').trim();
    if (!cleanName) {
        // If no alphanumeric characters, use first character of original name
        return name[0] || fallback || '?';
    }
    const names = cleanName.split(/\s+/).filter(n => n.length > 0);
    if (names.length >= 2) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return names[0]?.[0]?.toUpperCase() || fallback || '?';
};
// Profile type color mapping using Guardian design system
const getProfileColor = (profile) => {
    if (!profile)
        return 'bg-neutral-400';
    // Guardian design system profile colors
    const typeColors = {
        'self': 'bg-profile-self', // Blue
        'child': 'bg-profile-child', // Green
        'pet': 'bg-profile-pet', // Orange
        'dependent': 'bg-profile-dependent', // Purple
        'guardian': 'bg-profile-guardian' // Teal
    };
    return typeColors[profile.profile_type] || 'bg-neutral-500';
};
export function Avatar({ profile, size = 'md', className = '', showOnlineStatus = false, fallbackInitials }) {
    const [imageError, setImageError] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);
    const initials = getInitials(profile, fallbackInitials);
    const colorClass = getProfileColor(profile);
    const sizeClass = sizeClasses[size];
    // Check if we should show image
    const showImage = profile?.avatar_url && !imageError;
    return (_jsxs("div", { className: `relative flex items-center justify-center rounded-full font-semibold text-white select-none ${sizeClass} ${colorClass} ${className}`, children: [showImage && (_jsx("img", { src: profile.avatar_url, alt: profile?.display_name || 'Profile', className: `rounded-full object-cover ${sizeClass} transition-opacity duration-200 ${imageLoading ? 'opacity-0' : 'opacity-100'}`, onLoad: () => setImageLoading(false), onError: () => {
                    setImageError(true);
                    setImageLoading(false);
                } })), (!showImage || imageLoading) && (_jsx("span", { className: "select-none pointer-events-none", children: initials })), showOnlineStatus && profile && (_jsx("div", { className: `absolute -bottom-0.5 -right-0.5 bg-success-400 rounded-full border-2 border-white ${size === 'sm' ? 'w-2 h-2' :
                    size === 'md' ? 'w-2.5 h-2.5' :
                        size === 'lg' ? 'w-3 h-3' :
                            'w-4 h-4'}`, title: "Online" })), showImage && imageLoading && (_jsx("div", { className: "absolute inset-0 flex items-center justify-center rounded-full bg-neutral-200 animate-pulse", children: _jsx("div", { className: "w-4 h-4 border-2 border-neutral-400 border-t-neutral-600 rounded-full animate-spin" }) }))] }));
}
export function ProfileAvatar({ showName = true, namePosition = 'right', nameClassName = '', ...avatarProps }) {
    const { profile } = avatarProps;
    if (!showName) {
        return _jsx(Avatar, { ...avatarProps });
    }
    const nameClasses = `text-sm font-medium text-neutral-700 truncate ${nameClassName}`;
    if (namePosition === 'bottom') {
        return (_jsxs("div", { className: "flex flex-col items-center space-y-2", children: [_jsx(Avatar, { ...avatarProps }), profile && (_jsx("span", { className: `text-center ${nameClasses}`, children: profile.display_name }))] }));
    }
    // Default: name on right
    return (_jsxs("div", { className: "flex items-center space-x-3", children: [_jsx(Avatar, { ...avatarProps }), profile && (_jsx("span", { className: nameClasses, children: profile.display_name }))] }));
}
export function AvatarGroup({ profiles, max = 3, size = 'md', className = '', showCount = true }) {
    const visibleProfiles = profiles.slice(0, max);
    const remainingCount = Math.max(0, profiles.length - max);
    return (_jsxs("div", { className: `flex -space-x-2 ${className}`, children: [visibleProfiles.map((profile) => (_jsx(Avatar, { profile: profile, size: size, className: "ring-2 ring-white" }, profile.id))), showCount && remainingCount > 0 && (_jsx("div", { className: `
          flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600 font-medium ring-2 ring-white
          ${sizeClasses[size]}
        `, children: _jsxs("span", { className: "text-xs", children: ["+", remainingCount] }) }))] }));
}
