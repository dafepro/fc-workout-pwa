"use client";

import {
  ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useState,
} from "react";

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
  withStaffRewardImageURL,
} from "./team-reward-console-gateway";
import {
  prepareRewardImage,
  RewardImagePreparationError,
} from "./reward-image-preparation";

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
      imageMaxBytes={750 * 1024}
      imageHint={copy.prototypeImageHint}
      imageTooLargeMessage={copy.prototypeImageTooLarge}
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
      rewards={resource.data.items.map((reward) =>
        withStaffRewardImageURL(teamId, reward),
      )}
      prototype={false}
      imageEnabled
      imageMaxBytes={3 * 1024 * 1024}
      imageHint={copy.imageHint}
      imageTooLargeMessage={copy.imageTooLarge}
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
  imageMaxBytes,
  imageHint,
  imageTooLargeMessage,
  progressFor,
  previewProgress,
  onPublish,
  onCancel,
}: {
  teamId: string;
  rewards: PrototypeTeamReward[];
  prototype: boolean;
  imageEnabled: boolean;
  imageMaxBytes: number;
  imageHint: string;
  imageTooLargeMessage: string;
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
          imageMaxBytes={imageMaxBytes}
          imageHint={imageHint}
          imageTooLargeMessage={imageTooLargeMessage}
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
  imageMaxBytes,
  imageHint,
  imageTooLargeMessage,
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
  imageMaxBytes: number;
  imageHint: string;
  imageTooLargeMessage: string;
  imageError: string;
  busy: boolean;
  setDraft: Dispatch<SetStateAction<PrototypeTeamReward | null>>;
  onImageError: (message: string) => void;
  onPublish: () => void | Promise<void>;
  onDiscard: () => void;
}) {
  const [invalidNumberFields, setInvalidNumberFields] = useState<string[]>([]);
  const [imagePreparing, setImagePreparing] = useState(false);
  const updateRule = (patch: Partial<TeamRewardRule>) =>
    setDraft({
      ...draft,
      rule: { ...draft.rule, ...patch } as TeamRewardRule,
    });
  const setNumberFieldValidity = (field: string, valid: boolean) =>
    setInvalidNumberFields((current) =>
      valid
        ? current.filter((item) => item !== field)
        : current.includes(field)
          ? current
          : [...current, field],
    );
  const chooseRule = (rule: TeamRewardRule) => {
    setInvalidNumberFields([]);
    setDraft({ ...draft, rule });
  };

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!(["image/png", "image/jpeg"] as string[]).includes(file.type)) {
      input.value = "";
      onImageError(copy.imageWrongType);
      return;
    }
    setImagePreparing(true);
    onImageError("");
    void prepareRewardImage(file, imageMaxBytes)
      .then((imageDataUrl) =>
        setDraft((current) =>
          current ? { ...current, imageDataUrl } : current,
        ),
      )
      .catch((error: unknown) => {
        input.value = "";
        onImageError(
          error instanceof RewardImagePreparationError &&
            error.code === "too_large"
            ? imageTooLargeMessage
            : copy.imageReadFailed,
        );
      })
      .finally(() => setImagePreparing(false));
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
              <p className="console-warning reward-image-guidance">
                {copy.imageGuidance}
              </p>
              <label htmlFor="reward-prize-image">{copy.prizeImage}</label>
              <input
                key={draft.imageDataUrl ? "selected" : "empty"}
                id="reward-prize-image"
                type="file"
                accept="image/png,image/jpeg"
                disabled={imagePreparing}
                onChange={chooseImage}
              />
              <p className="console-hint">{imageHint}</p>
              {imagePreparing ? (
                <p className="console-hint" role="status">
                  {copy.imagePreparing}
                </p>
              ) : null}
              {imageError ? <p role="alert">{imageError}</p> : null}
              {draft.imageDataUrl ? (
                <>
                  <label htmlFor="reward-image-alt">{copy.imageAltLabel}</label>
                  <select
                    id="reward-image-alt"
                    value={draft.imageAltKind ?? "prize_image"}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        imageAltKind: event.target.value as NonNullable<
                          PrototypeTeamReward["imageAltKind"]
                        >,
                      })
                    }
                  >
                    <option value="prize_image">
                      {copy.imageAltOptions.prize_image}
                    </option>
                    <option value="team_experience">
                      {copy.imageAltOptions.team_experience}
                    </option>
                    <option value="food_or_treat">
                      {copy.imageAltOptions.food_or_treat}
                    </option>
                  </select>
                  <button
                    type="button"
                    className="button button--outline reward-image-remove"
                    onClick={() => {
                      setDraft({ ...draft, imageDataUrl: undefined });
                      onImageError("");
                    }}
                  >
                    {copy.removeImage}
                  </button>
                </>
              ) : null}
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
                  chooseRule({
                    version: 1,
                    kind: "qualifying_team_days",
                    requiredDays: 10,
                    minimumRosterPercent: 80,
                    participationScope: draft.rule.participationScope,
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
                  chooseRule({
                    version: 1,
                    kind: "teammate_consistency",
                    requiredPlayers: 8,
                    requiredDaysPerPlayer: 3,
                    participationScope: draft.rule.participationScope,
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
              <RewardNumberInput
                key="reward-required-days"
                id="reward-required-days"
                min={1}
                max={90}
                value={draft.rule.requiredDays}
                onValue={(requiredDays) => updateRule({ requiredDays })}
                onValidityChange={setNumberFieldValidity}
              />
              <label htmlFor="reward-roster-percent">
                {copy.rosterPercent}
              </label>
              <RewardNumberInput
                key="reward-roster-percent"
                id="reward-roster-percent"
                min={10}
                max={100}
                step={5}
                value={draft.rule.minimumRosterPercent}
                onValue={(minimumRosterPercent) =>
                  updateRule({ minimumRosterPercent })
                }
                onValidityChange={setNumberFieldValidity}
              />
            </>
          ) : (
            <>
              <label htmlFor="reward-required-players">
                {copy.requiredPlayers}
              </label>
              <RewardNumberInput
                key="reward-required-players"
                id="reward-required-players"
                min={1}
                max={100}
                value={draft.rule.requiredPlayers}
                onValue={(requiredPlayers) => updateRule({ requiredPlayers })}
                onValidityChange={setNumberFieldValidity}
              />
              <label htmlFor="reward-days-per-player">
                {copy.daysPerPlayer}
              </label>
              <RewardNumberInput
                key="reward-days-per-player"
                id="reward-days-per-player"
                min={1}
                max={90}
                value={draft.rule.requiredDaysPerPlayer}
                onValue={(requiredDaysPerPlayer) =>
                  updateRule({ requiredDaysPerPlayer })
                }
                onValidityChange={setNumberFieldValidity}
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
            disabled={
              busy ||
              imagePreparing ||
              !draft.prizeTitle.trim() ||
              invalidNumberFields.length > 0
            }
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

function RewardNumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  onValue,
  onValidityChange,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValue: (value: number) => void;
  onValidityChange: (field: string, valid: boolean) => void;
}) {
  const [rawValue, setRawValue] = useState(String(value));
  const valid = validRewardNumber(rawValue, min, max, step);

  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      required
      value={rawValue}
      aria-invalid={!valid}
      onChange={(event) => {
        const nextRawValue = event.target.value;
        const nextValid = validRewardNumber(nextRawValue, min, max, step);
        setRawValue(nextRawValue);
        onValidityChange(id, nextValid);
        if (nextValid) onValue(Number(nextRawValue));
      }}
    />
  );
}

function validRewardNumber(
  rawValue: string,
  min: number,
  max: number,
  step: number,
) {
  if (rawValue.trim() === "") return false;
  const value = Number(rawValue);
  return (
    Number.isInteger(value) &&
    value >= min &&
    value <= max &&
    (value - min) % step === 0
  );
}
