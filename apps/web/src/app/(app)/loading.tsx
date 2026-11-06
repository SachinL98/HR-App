/** Shown straight away while a page loads, so the screen never goes blank. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="space-y-2"><div className="h-7 w-56 rounded-ui bg-line" /><div className="h-4 w-80 max-w-full rounded-ui bg-line/70" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-ui border border-line bg-surface" />)}</div>
      <div className="h-72 rounded-ui border border-line bg-surface" />
    </div>
  );
}
