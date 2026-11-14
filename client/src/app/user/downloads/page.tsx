"use client";

export default function UserDownloadsPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-6">Your Downloads</h1>
        <p className="mb-8 text-slate-500">Here you can download your tickets and documents.</p>
        <div className="text-slate-400">No downloads available yet.</div>
      </div>
    </div>
  );
}
