"use client";

import Image from "next/image";
import { type CSSProperties, useState } from "react";

import {
  teamRewardCopy,
  teamRewardContributionCopy,
  teamRewardGoalCopy,
  teamRewardProgressCopy,
  teamRewardUnitProgressCopy,
} from "../../content/team-rewards";
import type { PrototypeRewardStatus } from "../../data/team-reward-prototype";
import type { TeamRewardProgress } from "../../domain/team-rewards";
import type { TeamRewardRule } from "../../domain/team-rewards";
import type { TeamRewardReportReason } from "../../data/team-reward-gateway";

export function TeamRewardCard({
  reward,
  progress,
  placement,
  onReport,
}: {
  reward: {
    id: string;
    status: PrototypeRewardStatus;
    prizeTitle: string;
    prizeDescription: string;
    imageDataUrl?: string;
    imageUrl?: string;
    imageAlt?: string;
    rule: TeamRewardRule;
  };
  progress: TeamRewardProgress;
  placement: "today" | "team" | "preview";
  onReport?: (reason: TeamRewardReportReason) => Promise<void>;
}) {
  const [reportState, setReportState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const headingId = `team-reward-${placement}-${reward.id}`;
  const achieved = reward.status === "achieved" || progress.achieved;
  const imageUrl = reward.imageDataUrl ?? reward.imageUrl;
  const visibleUnits = progress.units.slice(0, 20);
  return (
    <section
      className={`player-rewards player-rewards--active player-rewards--${placement}`}
      aria-labelledby={headingId}
    >
      <div className="player-rewards__content">
        <p className="player-eyebrow">{teamRewardCopy.eyebrow}</p>
        <strong id={headingId}>{reward.prizeTitle}</strong>
        {reward.prizeDescription ? <p>{reward.prizeDescription}</p> : null}
        <p className="player-rewards__goal">
          {teamRewardGoalCopy(reward.rule)}
        </p>
        <b>
          {teamRewardProgressCopy(
            reward.rule,
            progress.current,
            progress.target,
          )}
        </b>
        <p className="player-rewards__contribution-copy">
          {teamRewardContributionCopy(reward.rule, progress.started)}
        </p>
        <div
          className="player-rewards__progress"
          role="progressbar"
          aria-label={`Team contribution: ${progress.contributionPercent}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.contributionPercent}
        >
          <span style={{ width: `${progress.contributionPercent}%` }} />
        </div>
        <div
          className="player-rewards__unit-map"
          aria-label="Team progress map"
        >
          {visibleUnits.map((unit, index) => {
            const unitPercent = Math.min(
              100,
              (unit.current / unit.target) * 100,
            );
            const unitStyle = {
              "--reward-unit-progress": `${unitPercent}%`,
            } as CSSProperties;
            return (
              <span
                className={unit.complete ? "is-complete" : undefined}
                key={`${index}-${unit.current}-${unit.target}`}
                role="progressbar"
                aria-label={teamRewardUnitProgressCopy(
                  reward.rule,
                  index,
                  unit.current,
                  unit.target,
                )}
                aria-valuemin={0}
                aria-valuemax={unit.target}
                aria-valuenow={unit.current}
                style={unitStyle}
              >
                <small aria-hidden="true">
                  {unit.current}/{unit.target}
                </small>
              </span>
            );
          })}
          {progress.units.length > visibleUnits.length ? (
            <small>+{progress.units.length - visibleUnits.length}</small>
          ) : null}
        </div>
        {achieved ? (
          <p className="player-rewards__complete">
            <strong>{teamRewardCopy.achieved}</strong>
            {teamRewardCopy.achievedBody}
          </p>
        ) : null}
        {onReport ? (
          <details className="player-rewards__report">
            <summary>{teamRewardCopy.reportConcern}</summary>
            <p>{teamRewardCopy.reportHint}</p>
            <div>
              {teamRewardCopy.reportReasons.map((reason) => (
                <button
                  type="button"
                  key={reason.value}
                  disabled={reportState === "sending" || reportState === "sent"}
                  onClick={() => {
                    setReportState("sending");
                    void onReport(reason.value).then(
                      () => setReportState("sent"),
                      () => setReportState("error"),
                    );
                  }}
                >
                  {reason.label}
                </button>
              ))}
            </div>
            {reportState === "sent" ? (
              <small role="status">{teamRewardCopy.reportSent}</small>
            ) : null}
            {reportState === "error" ? (
              <small role="alert">{teamRewardCopy.reportFailed}</small>
            ) : null}
          </details>
        ) : null}
      </div>
      <div className="player-rewards__visual">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={
              reward.imageAlt ??
              teamRewardCopy.staff.imageAlt(reward.prizeTitle)
            }
            width={240}
            height={160}
            unoptimized
          />
        ) : (
          <span className="player-rewards__gift" aria-hidden="true">
            <i />
          </span>
        )}
      </div>
    </section>
  );
}
