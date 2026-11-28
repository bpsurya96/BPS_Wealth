import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Page Not Found</h1>
      <p className="text-sm text-slate-500 max-w-md">
        The requested wealth planning page could not be found.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-sm font-semibold"
      >
        Return to Overview
      </Link>
    </div>
  );
}
