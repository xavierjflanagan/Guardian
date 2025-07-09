import Link from 'next/link'

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="max-w-md mx-auto p-6 border rounded shadow">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Authentication Error</h1>
        <p className="text-red-600 mb-4">
          {searchParams.message || 'An error occurred during authentication. Please try again.'}
        </p>
        <Link
          href="/sign-in"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 inline-block text-center"
        >
          Return to Sign In
        </Link>
      </div>
    </div>
  )
} 