export function ProgressBar({
  value,
  max,
  tone = "lime",
  label,
}: {
  value: number;
  max: number;
  tone?: "lime" | "gold" | "blue" | "purple";
  label: string;
}) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <span
        className={`progress__fill progress__fill--${tone}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
