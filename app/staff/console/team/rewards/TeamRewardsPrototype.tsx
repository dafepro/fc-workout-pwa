"use client";

import { ChangeEvent, useState } from "react";

import { teamRewardCopy } from "../../../../content/team-rewards";
import {
  cancelPrototypeReward,
  createPrototypeReward,
  prototypeRewardProgress,
  publishPrototypeReward,
  upsertPrototypeReward,
  type PrototypeTeamReward,
} from "../../../../data/team-reward-prototype";
import { useTeamRewardPrototype } from "../../../../data/use-team-reward-prototype";
import {
  evaluateTeamReward,
  type TeamRewardProgress,
  type TeamRewardRule,
} from "../../../../domain/team-rewards";
import { TeamRewardCard } from "../../../../player/components/TeamRewardCard";
import { ConfirmButton } from "../../ConfirmButton";
import { ConsoleNotice } from "../../ConsoleChrome";
import { messageFor } from "../../api";
import { consoleCopy } from "../../copy";
import { useResource } from "../../useResource";
import {
  cancelConnectedTeamReward,
  createAndPublishTeamReward,
  type StaffTeamReward,
  type StaffTeamRewardsResponse,
} from "./team-reward-console-gateway";

const copy = teamRewardCopy.staff;

export function TeamRewardsPrototype({
  teamId,
  connected = false,
}: {
  teamId: string;
  connected?: boolean;
}) {
  return connected ? (
    <ConnectedTeamRewards teamId={teamId} />
  ) : (
    <LocalTeamRewards teamId={teamId} />
  );
}

function LocalTeamRewards({ teamId }: { teamId: string }) {
  const { rewards, replace } = useTeamRewardPrototype(teamId);
  return (
    <TeamRewardsWorkspace
      teamId={teamId}
      rewards={rewards}
      prototype
      imageEnabled
      progressFor={(reward) => prototypeRewardProgress(reward.rule)}
      previewProgress={(rule) => prototypeRewardProgress(rule)}
      onPublish={(draft) => {
        const published = publishPrototypeReward(draft, rewards);
        replace(upsertPrototypeReward(rewards, published));
      }}
      onCancel={(reward) =>
        replace(upsertPrototypeReward(rewards, cancelPrototypeReward(reward)))
      }
    />
  );
}

function ConnectedTeamRewards({ teamId }: { teamId: string }) {
  const resource = useResource<StaffTeamRewardsResponse>(
    `v1/staff/teams/${teamId}/rewards`,
  );
  if (resource.loading && !resource.data) return <p>{consoleCopy.loading}</p>;
  if (!resource.data) {
    return <ConsoleNotice message={resource.error || consoleCopy.loadFailed} />;
  }
  return (
    <TeamRewardsWorkspace
      teamId={teamId}
      rewards={resource.data.items}
      prototype={false}
      imageEnabled={false}
      progressFor={(reward) =>
        "progress" in reward
          ? (reward as StaffTeamReward).progress
          : emptyProgress(reward.rule)
      }
      previewProgress={emptyProgress}
      onPublish={async (draft) => {
        await createAndPublishTeamReward(teamId, draft);
        resource.reload();
      }}
      onCancel={async (reward) => {
        await cancelConnectedTeamReward(teamId, reward.id);
        resource.reload();
      }}
    />
  );
}

function emptyProgress(rule: TeamRewardRule) {
  return evaluateTeamReward(rule, { days: [], players: [] });
}

function TeamRewardsWorkspace({
  teamId,
  rewards,
  prototype,
  imageEnabled,
  progressFor,
  previewProgress,
  onPublish,
  onCancel,
}: {
  teamId: string;
  rewards: PrototypeTeamReward[];
  prototype: boolean;
  imageEnabled: boolean;
  progressFor: (reward: PrototypeTeamReward) => TeamRewardProgress;
  previewProgress: (rule: TeamRewardRule) => TeamRewardProgress;
  onPublish: (draft: PrototypeTeamReward) => void | Promise<void>;
  onCancel: (reward: PrototypeTeamReward) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<PrototypeTeamReward | null>(null);
  const [imageError, setImageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = rewards.find((reward) => reward.status === "active");
  const achieved = rewards.find((reward) => reward.status === "achieved");
  const featured = active ?? achieved;
  const cancelled = rewards.find((reward) => reward.status === "cancelled");

  return (
    <>
      <header className="reward-heading">
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </header>
      {prototype ? (
        <aside className="console-warning reward-prototype-note">
          <strong>{copy.prototypeLabel}</strong>
          <span>{copy.prototypeBody}</span>
        </aside>
      ) : null}
      {actionError ? <ConsoleNotice message={actionError} /> : null}

      {featured ? (
        <ActiveReward
          reward={featured}
          progress={progressFor(featured)}
          onCancel={
            active
              ? async () => {
                  setBusy(true);
                  setActionError("");
                  try {
                    await onCancel(active);
                  } catch (error) {
                    setActionError(messageFor(error));
                  } finally {
                    setBusy(false);
                  }
                }
              : undefined
          }
        />
      ) : null}

      {!active && draft ? (
        <RewardEditor
          draft={draft}
          progress={previewProgress(draft.rule)}
          imageEnabled={imageEnabled}
          imageError={imageError}
          busy={busy}
          setDraft={setDraft}
          onImageError={setImageError}
          onPublish={async () => {
            const publishing = draft;
            setDraft(null);
            setBusy(true);
            setActionError("");
            try {
              await onPublish(publishing);
            } catch (error) {
              setDraft(publishing);
              setActionError(messageFor(error));
            } finally {
              setBusy(false);
            }
          }}
          onDiscard={() => {
            setDraft(null);
            setImageError("");
          }}
        />
      ) : null}

      {!active && !draft ? (
        <section className="console-card">
          <h2 className="console-card__title">
            {cancelled ? copy.cancelled : copy.emptyTitle}
          </h2>
          <p>{cancelled ? copy.cancelledBody : copy.emptyBody}</p>
          {cancelled ? (
            <p className="console-hint">
              <strong>{cancelled.prizeTitle}</strong>
            </p>
          ) : null}
          <div className="console-actions">
            <button
              type="button"
              className="button button--lime"
              disabled={busy}
              onClick={() => setDraft(createPrototypeReward(teamId))}
            >
              {copy.create}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function ActiveReward({
  reward,
  progress,
  onCancel,
}: {
  reward: PrototypeTeamReward;
  progress: TeamRewardProgress;
  onCancel?: () => void | Promise<void>;
}) {
  return (
    <>
      <section className="console-card">
        <h2 className="console-card__title">
          {reward.status === "achieved"
            ? teamRewardCopy.achieved
            : teamRewardCopy.active}
        </h2>
        <TeamRewardCard
          reward={reward}
          progress={progress}
          placement="preview"
        />
      </section>
      <section className="console-card">
        <h2 className="console-card__title">{copy.progressTitle}</h2>
        <div className="reward-stats">
          <strong>{progress.percent}%</strong>
          <span>
            {progress.current} / {progress.target}
          </span>
        </div>
        <p className="console-hint">{copy.progressHint}</p>
        {progress.days?.length ? (
          <div className="reward-day-progress">
            <h3>{copy.recentDays}</h3>
            <ul>
              {progress.days
                .slice(-7)
                .reverse()
                .map((day) => (
                  <li key={day.date}>
                    <time dateTime={day.date}>{formatRewardDay(day.date)}</time>
                    <span>
                      {copy.dayProgress(
                        day.qualifyingPlayers,
                        day.activePlayers,
                        day.requiredPlayers,
                      )}
                    </span>
                    <strong>
                      {day.qualifies ? copy.dayCounted : copy.dayNotCounted}
                    </strong>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {onCancel ? (
          <div className="console-actions">
            <ConfirmButton
              label={copy.cancel}
              question={copy.cancelQuestion}
              confirmLabel={copy.cancelConfirm}
              onConfirm={onCancel}
            />
          </div>
        ) : null}
      </section>
    </>
  );
}

function formatRewardDay(day: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

function RewardEditor({
  draft,
  progress,
  imageEnabled,
  imageError,
  busy,
  setDraft,
  onImageError,
  onPublish,
  onDiscard,
}: {
  draft: PrototypeTeamReward;
  progress: TeamRewardProgress;
  imageEnabled: boolean;
  imageError: string;
  busy: boolean;
  setDraft: (reward: PrototypeTeamReward) => void;
  onImageError: (message: string) => void;
  onPublish: () => void | Promise<void>;
  onDiscard: () => void;
}) {
  const updateRule = (patch: Partial<TeamRewardRule>) =>
    setDraft({
      ...draft,
      rule: { ...draft.rule, ...patch } as TeamRewardRule,
    });

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(["image/png", "image/jpeg"] as string[]).includes(file.type)) {
      onImageError(copy.imageWrongType);
      return;
    }
    if (file.size > 750 * 1024) {
      onImageError(copy.imageTooLarge);
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setDraft({ ...draft, imageDataUrl: String(reader.result) });
      onImageError("");
    });
    reader.readAsDataURL(file);
  };

  return (
    <>
      <section className="console-card">
        <h2 className="console-card__title">{copy.draft}</h2>
        <form
          className="console-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor="reward-prize-name">{copy.prizeName}</label>
          <input
            id="reward-prize-name"
            value={draft.prizeTitle}
            maxLength={60}
            required
            onChange={(event) =>
              setDraft({ ...draft, prizeTitle: event.target.value })
            }
          />
          <label htmlFor="reward-prize-description">
            {copy.prizeDescription}
          </label>
          <textarea
            id="reward-prize-description"
            value={draft.prizeDescription}
            maxLength={180}
            rows={3}
            onChange={(event) =>
              setDraft({ ...draft, prizeDescription: event.target.value })
            }
          />
          {imageEnabled ? (
            <>
              <label htmlFor="reward-prize-image">{copy.prizeImage}</label>
              <input
                id="reward-prize-image"
                type="file"
                accept="image/png,image/jpeg"
                onChange={chooseImage}
              />
              <p className="console-hint">{copy.imageHint}</p>
              {imageError ? <p role="alert">{imageError}</p> : null}
            </>
          ) : (
            <p className="console-hint">{copy.connectedImageHint}</p>
          )}

          <fieldset className="reward-fieldset">
            <legend>{copy.goalType}</legend>
            <label className="reward-template">
              <input
                type="radio"
                name="reward-template"
                checked={draft.rule.kind === "qualifying_team_days"}
                onChange={() =>
                  setDraft({
                    ...draft,
                    rule: {
                      version: 1,
                      kind: "qualifying_team_days",
                      requiredDays: 10,
                      minimumRosterPercent: 80,
                      participationScope: draft.rule.participationScope,
                    },
                  })
                }
              />
              <span>
                <strong>{copy.templates.teamDays}</strong>
                <small>{copy.templates.teamDaysHint}</small>
              </span>
            </label>
            <label className="reward-template">
              <input
                type="radio"
                name="reward-template"
                checked={draft.rule.kind === "teammate_consistency"}
                onChange={() =>
                  setDraft({
                    ...draft,
                    rule: {
                      version: 1,
                      kind: "teammate_consistency",
                      requiredPlayers: 8,
                      requiredDaysPerPlayer: 3,
                      participationScope: draft.rule.participationScope,
                    },
                  })
                }
              />
              <span>
                <strong>{copy.templates.consistency}</strong>
                <small>{copy.templates.consistencyHint}</small>
              </span>
            </label>
          </fieldset>

          <label htmlFor="reward-participation">{copy.participation}</label>
          <select
            id="reward-participation"
            value={draft.rule.participationScope}
            onChange={(event) =>
              updateRule({
                participationScope: event.target
                  .value as TeamRewardRule["participationScope"],
              })
            }
          >
            <option value="recommended_workout">{copy.recommended}</option>
            <option value="any_approved_workout">{copy.anyApproved}</option>
          </select>

          {draft.rule.kind === "qualifying_team_days" ? (
            <>
              <label htmlFor="reward-required-days">{copy.requiredDays}</label>
              <input
                id="reward-required-days"
                type="number"
                min={1}
                max={90}
                value={draft.rule.requiredDays}
                onChange={(event) =>
                  updateRule({ requiredDays: Number(event.target.value) })
                }
              />
              <label htmlFor="reward-roster-percent">
                {copy.rosterPercent}
              </label>
              <input
                id="reward-roster-percent"
                type="number"
                min={10}
                max={100}
                step={5}
                value={draft.rule.minimumRosterPercent}
                onChange={(event) =>
                  updateRule({
                    minimumRosterPercent: Number(event.target.value),
                  })
                }
              />
            </>
          ) : (
            <>
              <label htmlFor="reward-required-players">
                {copy.requiredPlayers}
              </label>
              <input
                id="reward-required-players"
                type="number"
                min={1}
                max={100}
                value={draft.rule.requiredPlayers}
                onChange={(event) =>
                  updateRule({ requiredPlayers: Number(event.target.value) })
                }
              />
              <label htmlFor="reward-days-per-player">
                {copy.daysPerPlayer}
              </label>
              <input
                id="reward-days-per-player"
                type="number"
                min={1}
                max={90}
                value={draft.rule.requiredDaysPerPlayer}
                onChange={(event) =>
                  updateRule({
                    requiredDaysPerPlayer: Number(event.target.value),
                  })
                }
              />
            </>
          )}

          <label htmlFor="reward-start-date">{copy.startsOn}</label>
          <input
            id="reward-start-date"
            type="date"
            value={draft.startsOn}
            onChange={(event) =>
              setDraft({ ...draft, startsOn: event.target.value })
            }
          />
        </form>
      </section>

      <section className="console-card reward-preview">
        <h2 className="console-card__title">{copy.preview}</h2>
        <TeamRewardCard
          reward={draft}
          progress={progress}
          placement="preview"
        />
        <div className="console-actions">
          <button
            type="button"
            className="button button--lime"
            disabled={busy || !draft.prizeTitle.trim()}
            onClick={onPublish}
          >
            {copy.publish}
          </button>
          <button
            type="button"
            className="button button--outline"
            disabled={busy}
            onClick={onDiscard}
          >
            {copy.discard}
          </button>
        </div>
      </section>
    </>
  );
}
