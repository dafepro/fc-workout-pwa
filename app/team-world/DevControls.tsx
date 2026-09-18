"use client";
import { useEffect, useState } from "react";
import {
  minimalRendering,
  normalRendering,
  type RenderSettings,
  type renderReport,
} from "./diagnostics";
import { worldCopy } from "./copy";
const copy = worldCopy.diagnostics;
export function DevControls({
  settings,
  onChange,
  read,
}: {
  settings: RenderSettings;
  onChange: (next: RenderSettings) => void;
  read: () => ReturnType<typeof renderReport>;
}) {
  const [open, setOpen] = useState(false),
    [stats, setStats] = useState<ReturnType<typeof renderReport> | null>(null),
    [report, setReport] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    const poll = () => setStats(read());
    poll();
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
  }, [open, read]);
  const update = (next: RenderSettings) => {
    onChange(next);
    setReport("");
    setCopied(false);
  };
  return (
    <details
      className="team-world-debug"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{copy.title}</summary>
      <div className="team-world-debug-content">
        <p>{copy.help}</p>
        <div className="team-world-debug-presets">
          <button onClick={() => update({ ...normalRendering })}>
            {copy.normal}
          </button>
          <button onClick={() => update({ ...minimalRendering })}>
            {copy.minimal}
          </button>
        </div>
        <label>
          {copy.avatar}
          <select
            aria-label={copy.avatar}
            value={settings.avatar}
            onChange={(e) =>
              update({
                ...settings,
                avatar: e.target.value as RenderSettings["avatar"],
              })
            }
          >
            <option value="model">{copy.model}</option>
            <option value="capsule">{copy.capsule}</option>
          </select>
        </label>
        <label>
          {copy.material}
          <select
            aria-label={copy.material}
            value={settings.material}
            onChange={(e) =>
              update({
                ...settings,
                material: e.target.value as RenderSettings["material"],
              })
            }
          >
            <option value="original">{copy.original}</option>
            <option value="normal">{copy.plain}</option>
            <option value="wireframe">{copy.wireframe}</option>
          </select>
        </label>
        <label>
          {copy.resolution}
          <select
            aria-label={copy.resolution}
            value={settings.resolution}
            onChange={(e) =>
              update({
                ...settings,
                resolution: e.target.value as RenderSettings["resolution"],
              })
            }
          >
            <option value="1">100%</option>
            <option value="0.75">75%</option>
            <option value="0.5">50%</option>
          </select>
        </label>
        {(
          [
            "silhouette",
            "comic",
            "outlines",
            "animation",
            "campus",
            "freezeCamera",
          ] as const
        ).map((key) => (
          <label className="team-world-debug-check" key={key}>
            <input
              type="checkbox"
              checked={settings[key]}
              disabled={
                (key === "animation" && settings.avatar === "capsule") ||
                ((key === "comic" || key === "outlines") &&
                  (settings.avatar === "capsule" ||
                    settings.material !== "original")) ||
                (key === "outlines" && !settings.comic)
              }
              onChange={(e) => update({ ...settings, [key]: e.target.checked })}
            />
            {copy[key]}
          </label>
        ))}
        <p>
          {copy.stats(
            stats?.performance?.frameP95Ms,
            stats?.performance?.drawCalls,
          )}
        </p>
        <button
          onClick={async () => {
            const text = JSON.stringify(read(), null, 2);
            setReport(text);
            setCopied(false);
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              /* The selectable report remains available. */
            }
          }}
        >
          {copy.copy}
        </button>
        {report && (
          <>
            <p role="status">{copied ? copy.copied : copy.selectReport}</p>
            <textarea
              aria-label={copy.report}
              readOnly
              value={report}
              rows={7}
            />
          </>
        )}
      </div>
    </details>
  );
}
