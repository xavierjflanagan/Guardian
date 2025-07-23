// Supabase sign-up coming soon. For now, redirect users to sign-in or show a message.
export default function SignUpPage() {
  return (
    <div className="max-w-md mx-auto mt-20 p-6 border rounded shadow">
      <h1 className="text-2xl font-bold mb-4">Sign up</h1>
      <p>Sign-up via magic link is handled on the sign-in page. Please <a href="/sign-in" className="text-blue-600 underline">sign in</a> to get started.</p>
    </div>
  );
}
