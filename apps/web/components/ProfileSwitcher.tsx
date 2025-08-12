'use client';

import { useState } from 'react';
import { ChevronDownIcon, PlusIcon, UserIcon } from '@heroicons/react/24/outline';
import { useProfile } from '@/app/providers/ProfileProvider';
import { Avatar, Dropdown, DropdownItem, DropdownDivider } from '@guardian/ui';
import { AddProfilePlaceholder } from '@/components/profile/AddProfilePlaceholder';

export default function ProfileSwitcher() {
  const { currentProfile, profiles, switchProfile, isLoading, error, refreshProfiles } = useProfile();
  const [isSwitching, setIsSwitching] = useState(false);
  const [showAddProfile, setShowAddProfile] = useState(false);

  const handleSwitchProfile = async (profileId: string) => {
    if (profileId === currentProfile?.id || isSwitching) return;
    
    setIsSwitching(true);
    try {
      await switchProfile(profileId);
    } catch (error) {
      console.error('Failed to switch profile:', error);
      // TODO: Show error toast in Phase 2
    } finally {
      setIsSwitching(false);
    }
  };

  const handleAddProfile = () => {
    setShowAddProfile(true);
  };

  const getProfileTypeLabel = (type: string) => {
    const labels = {
      'self': '',
      'child': 'Child',
      'pet': 'Pet',
      'dependent': 'Dependent'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const isLoadingOrSwitching = isLoading || isSwitching;

  // Handle error state
  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50">
        <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
          <span className="text-red-600 text-xs">!</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-red-700 truncate">Failed to load profiles</span>
          <button 
            onClick={refreshProfiles}
            className="text-xs text-red-600 hover:text-red-800 underline text-left"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <Dropdown
      align="right"
      trigger={
        <div 
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200
            ${isLoadingOrSwitching 
              ? 'opacity-75 cursor-not-allowed bg-gray-50 border-gray-200' 
              : 'hover:bg-gray-50 border-gray-300 cursor-pointer'
            }
          `}
        >
          <div className={`transition-transform duration-200 ${isSwitching ? 'animate-pulse' : ''}`}>
            <Avatar 
              profile={currentProfile} 
              size="sm" 
              className={isSwitching ? 'animate-pulse' : ''}
            />
          </div>
          
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-gray-900 truncate">
              {currentProfile?.display_name || 'Loading...'}
            </span>
            {currentProfile?.profile_type !== 'self' && (
              <span className="text-xs text-gray-500">
                {getProfileTypeLabel(currentProfile?.profile_type || '')}
              </span>
            )}
          </div>
          
          <ChevronDownIcon 
            className={`
              w-4 h-4 text-gray-400 transition-transform duration-200
              ${isLoadingOrSwitching ? 'animate-spin' : ''}
            `}
          />
        </div>
      }
    >
      <div className="py-1">
        {/* Current profiles */}
        {profiles.map((profile) => (
          <DropdownItem
            key={profile.id}
            active={profile.id === currentProfile?.id}
            onClick={() => handleSwitchProfile(profile.id)}
            disabled={isSwitching}
          >
            <div className="flex items-center gap-3">
              <Avatar profile={profile} size="sm" />
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {profile.display_name}
                </div>
                {profile.profile_type !== 'self' && (
                  <div className="text-xs text-gray-500">
                    {getProfileTypeLabel(profile.profile_type)}
                  </div>
                )}
              </div>
              
              {profile.id === currentProfile?.id && (
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              )}
            </div>
          </DropdownItem>
        ))}

        {profiles.length > 0 && <DropdownDivider />}

        {/* Add profile option */}
        <DropdownItem
          onClick={handleAddProfile}
          disabled={isSwitching}
          className="text-blue-600 hover:bg-blue-50"
        >
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
              <PlusIcon className="w-3 h-3 text-blue-600" />
            </div>
            <span className="text-sm font-medium">Add Profile</span>
          </div>
        </DropdownItem>

        {profiles.length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-500 text-center">
            <UserIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p>No profiles available</p>
            <button 
              onClick={handleAddProfile}
              className="mt-2 text-blue-600 hover:text-blue-700 text-xs font-medium"
            >
              Create your first profile
            </button>
          </div>
        )}
      </div>
    </Dropdown>

    {/* Add Profile Modal */}
    {showAddProfile && (
      <AddProfilePlaceholder 
        onClose={() => setShowAddProfile(false)} 
      />
    )}
    </>
  );
}


