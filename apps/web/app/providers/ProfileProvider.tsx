'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, startTransition } from 'react'
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
  // Performance optimization additions
  isSwitchingProfile: boolean
  lastSwitchTime: number | null
  switchPerformance: {
    averageSwitchTime: number
    totalSwitches: number
  }
  // New additions for prefetching
  prefetchAllowedPatients: (profileId: string) => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)
// Exporting the context enables tests to provide a controlled value without
// relying on module-level hook mocks
export { ProfileContext }

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [userId, setUserId] = useState<string | null>(null)

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [allowedPatients, setAllowedPatients] = useState<AllowedPatient[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  
  // Performance optimization state
  const [isSwitchingProfile, setIsSwitchingProfile] = useState<boolean>(false)
  const [lastSwitchTime, setLastSwitchTime] = useState<number | null>(null)
  const [switchPerformance, setSwitchPerformance] = useState({
    averageSwitchTime: 0,
    totalSwitches: 0
  })
  
  // Fix #3: Use useRef for cache to avoid expensive re-renders
  const allowedPatientsCache = useRef<Map<string, AllowedPatient[]>>(new Map())
  const LRU_CACHE_SIZE = 50 // Cap at 50 profiles to prevent unbounded growth

  // Cache helpers with LRU eviction
  const cacheHelpers = useMemo(() => ({
    get: (profileId: string) => allowedPatientsCache.current.get(profileId),
    set: (profileId: string, patients: AllowedPatient[]) => {
      // LRU eviction if at capacity
      if (allowedPatientsCache.current.size >= LRU_CACHE_SIZE) {
        const firstKey = allowedPatientsCache.current.keys().next().value
        allowedPatientsCache.current.delete(firstKey)
        console.log(`Evicted profile ${firstKey} from cache (LRU)`)
      }
      allowedPatientsCache.current.set(profileId, patients)
    },
    clear: () => {
      allowedPatientsCache.current.clear()
      console.log('Cleared profile cache')
    },
    size: () => allowedPatientsCache.current.size
  }), [])

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
    async (profileId: string, useCache: boolean = true) => {
      // Check cache first for family profile switching optimization
      const cachedData = cacheHelpers.get(profileId)
      if (useCache && cachedData) {
        setAllowedPatients(cachedData)
        console.log(`Loading allowed patients from cache for profile ${profileId}`)
        return
      }

      try {
        console.log(`Loading allowed patients from database for profile ${profileId}`)
        const { data, error } = await supabase.rpc('get_allowed_patient_ids', { p_profile_id: profileId })
        if (error) throw error
        
        const patients = Array.isArray(data) ? data : []
        setAllowedPatients(patients)
        
        // Cache with LRU eviction
        cacheHelpers.set(profileId, patients)
      } catch (error) {
        console.warn(`Failed to load allowed patients for profile ${profileId}:`, error)
        setAllowedPatients([])
        throw error // Re-throw for switchProfile rollback handling
      }
    },
    [supabase, cacheHelpers]
  )

  // Prefetch function for hover/idle optimization
  const prefetchAllowedPatients = useCallback(async (profileId: string) => {
    // Only prefetch if not already cached
    if (!cacheHelpers.get(profileId)) {
      try {
        const { data, error } = await supabase.rpc('get_allowed_patient_ids', { p_profile_id: profileId })
        if (!error && Array.isArray(data)) {
          cacheHelpers.set(profileId, data)
          console.log(`Prefetched allowed patients for profile ${profileId}`)
        }
      } catch (error) {
        console.warn(`Failed to prefetch allowed patients for ${profileId}:`, error)
      }
    }
  }, [supabase, cacheHelpers])

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
      
      // Don't switch if already current profile (no-op optimization)
      if (currentProfile?.id === profileId) return
      
      // Store previous state for rollback protection
      const previousProfile = currentProfile
      const previousAllowedPatients = allowedPatients
      
      const switchStartTime = performance.now()
      setIsSwitchingProfile(true)
      setError(null)
      
      try {
        // Optimistic update with startTransition to avoid blocking UI
        startTransition(() => {
          setCurrentProfile(next)
        })
        
        console.log(`Switching to profile: ${next.display_name} (${profileId})`)
        
        // Load allowed patients with rollback protection
        await loadAllowedPatients(profileId, true)
        
        // Log the profile switch asynchronously to avoid blocking UX
        supabase.from('user_events').insert({
          profile_id: profileId,
          action: 'profile_switch',
          metadata: { 
            to_profile: profileId, 
            profile_name: next.display_name,
            switch_time_ms: Math.round(performance.now() - switchStartTime)
          },
          session_id: crypto.randomUUID(),
          privacy_level: 'internal'
        }).then(({ error }) => {
          if (error) console.warn('Failed to log profile switch:', error)
        })
        
        // Update performance tracking
        const switchTime = performance.now() - switchStartTime
        setLastSwitchTime(switchTime)
        setSwitchPerformance(prev => ({
          totalSwitches: prev.totalSwitches + 1,
          averageSwitchTime: ((prev.averageSwitchTime * prev.totalSwitches) + switchTime) / (prev.totalSwitches + 1)
        }))
        
        console.log(`Profile switch completed in ${Math.round(switchTime)}ms`)
        
      } catch (error) {
        // ROLLBACK: Restore previous state on failure
        console.error('Profile switch failed, rolling back:', error)
        startTransition(() => {
          setCurrentProfile(previousProfile)
          setAllowedPatients(previousAllowedPatients)
        })
        setError('Failed to switch profile. Please try again.')
      } finally {
        setIsSwitchingProfile(false)
      }
    },
    [profiles, loadAllowedPatients, supabase, currentProfile, allowedPatients]
  )

  const refreshProfiles = useCallback(async () => {
    await loadProfiles()
  }, [loadProfiles])

  // Cache invalidation on sign-out or profile archive
  useEffect(() => {
    if (!userId) {
      cacheHelpers.clear()
    }
  }, [userId, cacheHelpers])

  const value: ProfileContextValue = useMemo(
    () => ({ 
      currentProfile, 
      profiles, 
      allowedPatients, 
      switchProfile, 
      refreshProfiles, 
      isLoading, 
      error,
      // Performance optimization properties
      isSwitchingProfile,
      lastSwitchTime,
      switchPerformance,
      // Prefetching functionality
      prefetchAllowedPatients
    }),
    [currentProfile, profiles, allowedPatients, switchProfile, refreshProfiles, isLoading, error, isSwitchingProfile, lastSwitchTime, switchPerformance, prefetchAllowedPatients]
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider')
  return ctx
}

export type { Profile, AllowedPatient, ProfileContextValue }


