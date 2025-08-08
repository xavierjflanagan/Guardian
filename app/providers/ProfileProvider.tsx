'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabaseClientSSR'

type Profile = {
  id: string
  account_owner_id: string
  profile_type: string
  display_name: string
  archived: boolean
  created_at: string
}

type AllowedPatient = {
  patient_id: string
  access_type: string
  relationship: string
}

type ProfileContextValue = {
  currentProfile: Profile | null
  profiles: Profile[]
  allowedPatients: AllowedPatient[]
  switchProfile: (profileId: string) => Promise<void>
  refreshProfiles: () => Promise<void>
  isLoading: boolean
  error: string | null
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [userId, setUserId] = useState<string | null>(null)

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [allowedPatients, setAllowedPatients] = useState<AllowedPatient[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Load auth user id (client-side)
  useEffect(() => {
    let isMounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!isMounted) return
      setUserId(data.user?.id ?? null)
    })()
    return () => {
      isMounted = false
    }
  }, [supabase])

  const loadAllowedPatients = useCallback(
    async (profileId: string) => {
      try {
        const { data, error } = await supabase.rpc('get_allowed_patient_ids', { p_profile_id: profileId })
        if (error) throw error
        setAllowedPatients(Array.isArray(data) ? data : [])
      } catch {
        setAllowedPatients([])
      }
    },
    [supabase]
  )

  const loadProfiles = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    setError(null)
    try {
      const { data: rows, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('account_owner_id', userId)
        .eq('archived', false)
        .order('created_at', { ascending: true })
      if (error) throw error

      const list = (rows ?? []) as Profile[]
      setProfiles(list)

      if (list.length > 0) {
        const preferred = list.find((p) => p.profile_type === 'self') ?? list[0]
        setCurrentProfile(preferred)
        await loadAllowedPatients(preferred.id)
      } else {
        setCurrentProfile(null)
        setAllowedPatients([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, userId, loadAllowedPatients])

  useEffect(() => {
    if (userId) {
      loadProfiles()
    } else {
      setCurrentProfile(null)
      setProfiles([])
      setAllowedPatients([])
      setIsLoading(false)
      setError(null)
    }
  }, [userId, loadProfiles])

  const switchProfile = useCallback(
    async (profileId: string) => {
      const next = profiles.find((p) => p.id === profileId)
      if (!next) return
      setIsLoading(true)
      try {
        setCurrentProfile(next)
        await loadAllowedPatients(profileId)
        await supabase.from('user_events').insert({
          profile_id: profileId,
          action: 'profile_switch',
          metadata: { to_profile: profileId, profile_name: next.display_name },
          session_id: crypto.randomUUID(),
          privacy_level: 'internal'
        })
      } finally {
        setIsLoading(false)
      }
    },
    [profiles, loadAllowedPatients, supabase]
  )

  const refreshProfiles = useCallback(async () => {
    await loadProfiles()
  }, [loadProfiles])

  const value: ProfileContextValue = useMemo(
    () => ({ currentProfile, profiles, allowedPatients, switchProfile, refreshProfiles, isLoading, error }),
    [currentProfile, profiles, allowedPatients, switchProfile, refreshProfiles, isLoading, error]
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider')
  return ctx
}

export type { Profile, AllowedPatient, ProfileContextValue }


