export interface Profile {
    id: string;
    display_name: string;
    profile_type: 'self' | 'child' | 'pet' | 'dependent' | 'guardian';
    avatar_url?: string;
}
export interface AvatarProps {
    profile: Profile | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    showOnlineStatus?: boolean;
    fallbackInitials?: string;
}
export declare function Avatar({ profile, size, className, showOnlineStatus, fallbackInitials }: AvatarProps): import("react/jsx-runtime").JSX.Element;
export interface ProfileAvatarProps extends AvatarProps {
    showName?: boolean;
    namePosition?: 'right' | 'bottom';
    nameClassName?: string;
}
export declare function ProfileAvatar({ showName, namePosition, nameClassName, ...avatarProps }: ProfileAvatarProps): import("react/jsx-runtime").JSX.Element;
export interface AvatarGroupProps {
    profiles: Profile[];
    max?: number;
    size?: AvatarProps['size'];
    className?: string;
    showCount?: boolean;
}
export declare function AvatarGroup({ profiles, max, size, className, showCount }: AvatarGroupProps): import("react/jsx-runtime").JSX.Element;
