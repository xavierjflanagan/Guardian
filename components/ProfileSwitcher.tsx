'use client'

import { useState } from 'react'
import { useProfile } from '@/app/providers/ProfileProvider'

export default function ProfileSwitcher() {
  const { currentProfile, profiles, switchProfile, isLoading } = useProfile()
  const [isSwitching, setIsSwitching] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value
    if (!nextId || nextId === currentProfile?.id) return
    setIsSwitching(true)
    try {
      await switchProfile(nextId)
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="profile-switcher" className="text-sm text-gray-600">Profile</label>
      <select
        id="profile-switcher"
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
        value={currentProfile?.id ?? ''}
        onChange={handleChange}
        disabled={isLoading || isSwitching || profiles.length === 0}
      >
        {profiles.length === 0 && <option value="">No profiles</option>}
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name} {p.profile_type !== 'self' ? `(${p.profile_type})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}


