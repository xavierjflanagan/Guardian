'use client'

import type { ReactNode } from 'react'
import { ProfileProvider } from '@/app/providers/ProfileProvider'

export function Providers({ children }: { children: ReactNode }) {
  return <ProfileProvider>{children}</ProfileProvider>
}


