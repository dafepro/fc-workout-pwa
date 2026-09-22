"use client";
import { useEffect, useState } from "react";
import {
  minimalRendering,
  normalRendering,
  type RenderSettings,
  type renderReport,
} from "./diagnostics";
import { worldCopy } from "./copy";
import type { BallTuning } from "./ball-tuning";
const copy = worldCopy.diagnostics;
const ballControls = [
  { key: "gravity", min: 3, max: 12, unit: "m/s²" },
  { key: "speed", min: 2, max: 10, unit: "m/s" },
  { key: "friction", min: 0, max: 3, unit: "m/s²" },
] as const;
export function DevControls({
  settings,
  onChange,
  read,
  ballTuning,
  onBallTuningChange,
  isHost,
}: {
  settings: RenderSettings;
  onChange: (next: RenderSettings) => void;
  read: (capture?: boolean) => ReturnType<typeof renderReport>;
  ballTuning: BallTuning;
  onBallTuningChange: (next: BallTuning) => void;
  isHost: boolean;
}) {
  const [reference, setReference] = useState(false);
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
    <>
      {reference && (
        <div
          className="team-world-motion-reference"
          aria-label={copy.reference}
        >
          <span>{copy.reference}</span>
          <div>
            <i />
          </div>
        </div>
      )}
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
                onChange={(e) =>
                  update({ ...settings, [key]: e.target.checked })
                }
              />
              {copy[key]}
            </label>
          ))}
          <label className="team-world-debug-check">
            <input
              type="checkbox"
              checked={reference}
              onChange={(e) => setReference(e.target.checked)}
            />
            {copy.reference}
          </label>
          <fieldset className="team-world-debug-ball" disabled={!isHost}>
            <legend>{copy.ballTitle}</legend>
            {ballControls.map(({ key, min, max, unit }) => (
              <label key={key}>
                <span>{copy.ball[key]}</span>
                <output>
                  {ballTuning[key].toFixed(1)} {unit}
                </output>
                <input
                  type="range"
                  aria-label={copy.ball[key]}
                  min={min}
                  max={max}
                  step="0.1"
                  value={ballTuning[key]}
                  onChange={(e) =>
                    onBallTuningChange({
                      ...ballTuning,
                      [key]: e.currentTarget.valueAsNumber,
                    })
                  }
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() =>
                onBallTuningChange({ gravity: 5.4, speed: 6.1, friction: 1 })
              }
            >
              {copy.ballReset}
            </button>
          </fieldset>
          <p>{isHost ? copy.ballHost : copy.ballPeer}</p>
          <p>{copy.captureHelp}</p>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(read(true))], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "zoomigo-motion-capture.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            {copy.download}
          </button>
          <p>
            {copy.stats(
              stats?.performance?.frameP95Ms,
              stats?.performance?.drawCalls,
            )}
          </p>
          <button
            onClick={async () => {
              const text = JSON.stringify(read(true), null, 2);
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
    </>
  );
}
