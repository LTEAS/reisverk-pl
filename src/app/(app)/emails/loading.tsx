export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="h-8 w-48 rounded-lg bg-[#1a1918] animate-pulse" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-24 rounded-xl bg-[#1a1918] animate-pulse" />
      ))}
    </div>
  )
}
