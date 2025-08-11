'use client'

import { useProfile } from '@/app/providers/ProfileProvider'

export default function ProfileDebugPage() {
  const { currentProfile, profiles, allowedPatients, switchProfile, isLoading, error } = useProfile()

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Profile Debug</h1>

      {isLoading && <div>Loading...</div>}
      {error && <div className="text-red-600">{error}</div>}

      <section className="space-y-2">
        <h2 className="font-medium">Current Profile</h2>
        {currentProfile ? (
          <div className="rounded border p-3">
            <div><strong>ID:</strong> {currentProfile.id}</div>
            <div><strong>Name:</strong> {currentProfile.display_name}</div>
            <div><strong>Type:</strong> {currentProfile.profile_type}</div>
          </div>
        ) : (
          <div>No profile selected.</div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">All Profiles</h2>
        <div className="grid gap-3">
          {profiles.length === 0 && <div>No profiles found.</div>}
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <div className="font-medium">{p.display_name}</div>
                <div className="text-sm text-gray-600">{p.profile_type}</div>
              </div>
              <button
                className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
                onClick={() => switchProfile(p.id)}
                disabled={currentProfile?.id === p.id}
              >
                {currentProfile?.id === p.id ? 'Active' : 'Switch'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Allowed Patients</h2>
        {allowedPatients.length === 0 ? (
          <div>None</div>
        ) : (
          <ul className="list-disc pl-5">
            {allowedPatients.map((ap) => (
              <li key={ap.patient_id}>
                {ap.patient_id} ({ap.relationship} - {ap.access_type})
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}


