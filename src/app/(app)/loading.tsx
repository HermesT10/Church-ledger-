/**
 * Loading UI for the authenticated app shell.
 * Shown automatically by Next.js during page transitions
 * while server components are fetching data.
 */
export default function AppLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6 animate-pulse">
      {/* Page header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-muted" />
        <div className="h-4 w-72 rounded-md bg-muted" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border bg-card p-6 shadow-sm space-y-3"
          >
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-8 w-28 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Content card skeleton */}
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="p-6 space-y-4">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-4 flex-1 rounded bg-muted" />
                <div className="h-4 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
