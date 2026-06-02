export default function Spinner({ size = "sm" }) {
  const s = size === "sm" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex justify-center py-6">
      <div className={`${s} animate-spin rounded-full border-2 border-yellow-400 border-t-transparent`} />
    </div>
  );
}
