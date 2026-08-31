"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import {
  consoleFormRequest,
  consoleRequest,
  ConsoleError,
  messageFor,
} from "../api";
import { ConfirmButton } from "../ConfirmButton";
import { consoleCopy, staffCopy } from "../copy";
import type { StaffTeamReward, TeamRewardDefinition } from "../types";
import {
  prepareRewardImage,
  type PreparedRewardImage,
  RewardImagePreparationError,
} from "./reward-image-preparation";

export function TeamRewardPanel({
  teamId,
  now,
}: {
  teamId: string;
  now?: Date;
}) {
  const [definitions, setDefinitions] = useState<TeamRewardDefinition[]>([]);
  const [reward, setReward] = useState<StaffTeamReward | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [preparedImage, setPreparedImage] =
    useState<PreparedRewardImage | null>(null);
  const [imagePreparing, setImagePreparing] = useState(false);
  const [requiredDays, setRequiredDays] = useState("3");
  const [minimumRosterPercent, setMinimumRosterPercent] = useState("70");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dateError, setDateError] = useState("");
  const publishKey = useRef("");
  const startsOnRef = useRef<HTMLInputElement>(null);
  const endsOnRef = useRef<HTMLInputElement>(null);
  const imageSelectionRef = useRef(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      consoleRequest<{ definitions: TeamRewardDefinition[] }>(
        "v1/staff/team-reward-definitions",
      ),
      consoleRequest<StaffTeamReward>(
        `v1/staff/teams/${teamId}/team-reward`,
      ).catch((caught: unknown) => {
        if (caught instanceof ConsoleError && caught.status === 404)
          return null;
        throw caught;
      }),
      consoleRequest<{ timeZone: string }>(`v1/staff/teams/${teamId}`),
    ]).then(
      ([catalog, current, team]) => {
        if (!active) return;
        setDefinitions(catalog.definitions);
        setReward(current);
        const definition = catalog.definitions[0];
        setTitle((value) => value || definition?.title || "");
        setDescription((value) => value || definition?.description || "");
        const defaults = rewardDateDefaults(team.timeZone, now ?? new Date());
        setStartsOn((value) => value || defaults.startsOn);
        setEndsOn((value) => value || defaults.endsOn);
      },
      (caught: unknown) => {
        if (active) setError(messageFor(caught));
      },
    );
    return () => {
      active = false;
    };
  }, [now, teamId]);

  useEffect(
    () => () => {
      preparedImage?.dispose();
    },
    [preparedImage],
  );

  useEffect(
    () => () => {
      imageSelectionRef.current += 1;
    },
    [],
  );

  async function publish(event: FormEvent) {
    event.preventDefault();
    const definition = definitions[0];
    if (!definition) return;
    if (!startsOn) {
      setDateError(consoleCopy.teamReward.startRequired);
      startsOnRef.current?.focus();
      return;
    }
    if (!endsOn) {
      setDateError(consoleCopy.teamReward.endRequired);
      endsOnRef.current?.focus();
      return;
    }
    if (endsOn < startsOn) {
      setDateError(consoleCopy.teamReward.endBeforeStart);
      endsOnRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setDateError("");
    setNotice("");
    publishKey.current ||= crypto.randomUUID();
    try {
      let mediaId: string | undefined;
      if (preparedImage) {
        const form = new FormData();
        form.set("image", preparedImage.file);
        form.set("altKind", "prize_image");
        const uploaded = await consoleFormRequest<{ id: string }>(
          `v1/staff/teams/${teamId}/reward-media`,
          { body: form },
        );
        mediaId = uploaded.id;
      }
      const created = await consoleRequest<StaffTeamReward>(
        `v1/staff/teams/${teamId}/team-reward`,
        {
          method: "POST",
          idempotencyKey: publishKey.current,
          body: {
            definitionId: definition.id,
            title: title.trim(),
            description: description.trim(),
            mediaId,
            startsOn,
            endsOn,
            requiredDays: Number(requiredDays),
            minimumRosterPercent: Number(minimumRosterPercent),
          },
        },
      );
      publishKey.current = "";
      setReward(created);
      setPreparedImage(null);
      setNotice(consoleCopy.teamReward.published);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const selection = ++imageSelectionRef.current;
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setImagePreparing(false);
      setPreparedImage(null);
      return;
    }
    if (!["image/jpeg", "image/png"].includes(selected.type)) {
      event.target.value = "";
      setImagePreparing(false);
      setPreparedImage(null);
      setError(consoleCopy.teamReward.imageType);
      return;
    }
    setError("");
    setImagePreparing(true);
    try {
      const next = await prepareRewardImage(selected);
      if (selection !== imageSelectionRef.current) {
        next.dispose();
        return;
      }
      setPreparedImage(next);
    } catch (caught) {
      if (selection !== imageSelectionRef.current) return;
      event.target.value = "";
      setPreparedImage(null);
      setError(
        caught instanceof RewardImagePreparationError &&
          caught.code === "too_large"
          ? consoleCopy.teamReward.imageSize
          : consoleCopy.teamReward.imageReadFailed,
      );
    } finally {
      if (selection === imageSelectionRef.current) setImagePreparing(false);
    }
  }

  async function cancel() {
    if (!reward) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await consoleRequest(
        `v1/staff/teams/${teamId}/team-reward/${reward.id}/cancel`,
        { method: "POST" },
      );
      setReward(null);
      setNotice(consoleCopy.teamReward.cancelled);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  const definition = definitions[0];
  return (
    <section className="console-card" aria-label={consoleCopy.teamReward.title}>
      <h2 className="console-card__title">{consoleCopy.teamReward.title}</h2>
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="notice notice--success">{notice}</p> : null}

      {reward ? (
        <div>
          <h3>{reward.title}</h3>
          <p>{reward.description}</p>
          {reward.mediaId ? (
            // The private route needs the signed-in browser's staff cookie.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="team-reward-image"
              src={`/staff/api/backend/v1/staff/teams/${encodeURIComponent(teamId)}/reward-media/${encodeURIComponent(reward.mediaId)}?variant=thumbnail`}
              alt="Prize for the team"
            />
          ) : null}
          <p>
            {consoleCopy.teamReward.progress(
              reward.progress.current,
              reward.progress.target,
            )}
          </p>
          <p className="console-hint">
            {consoleCopy.teamReward.rule(
              reward.rule.requiredDays,
              reward.rule.minimumRosterPercent,
            )}{" "}
            · {consoleCopy.teamReward.window(reward.startsOn, reward.endsOn)}
          </p>
          {reward.status === "active" ? (
            <ConfirmButton
              label={consoleCopy.teamReward.cancel}
              question={consoleCopy.teamReward.cancelQuestion}
              confirmLabel={consoleCopy.teamReward.cancelConfirm}
              onConfirm={cancel}
            />
          ) : null}
        </div>
      ) : (
        <>
          <p>{consoleCopy.teamReward.none}</p>
          {definition ? (
            <form className="console-form" onSubmit={publish} noValidate>
              <label htmlFor="reward-title">
                {consoleCopy.teamReward.rewardName}
              </label>
              <input
                id="reward-title"
                required
                maxLength={60}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <label htmlFor="reward-description">
                {consoleCopy.teamReward.description}
              </label>
              <textarea
                id="reward-description"
                maxLength={180}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <p className="console-warning">
                {consoleCopy.teamReward.imageGuidance}
              </p>
              <label htmlFor="reward-image">
                {consoleCopy.teamReward.image}
              </label>
              <input
                id="reward-image"
                type="file"
                accept="image/png,image/jpeg"
                disabled={imagePreparing}
                onChange={(event) => void chooseImage(event)}
              />
              <p className="console-hint">{consoleCopy.teamReward.imageHint}</p>
              {imagePreparing ? (
                <p className="console-hint" role="status">
                  {consoleCopy.teamReward.imagePreparing}
                </p>
              ) : null}
              {preparedImage ? (
                // The browser-owned blob URL is released when it is replaced.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="team-reward-image"
                  src={preparedImage.previewURL}
                  alt={consoleCopy.teamReward.imagePreviewAlt}
                />
              ) : null}
              <label htmlFor="reward-starts-on">
                {consoleCopy.teamReward.startsOn}
              </label>
              <input
                id="reward-starts-on"
                ref={startsOnRef}
                type="date"
                required
                aria-invalid={Boolean(dateError && !startsOn)}
                aria-describedby={dateError ? "reward-date-error" : undefined}
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
              <label htmlFor="reward-ends-on">
                {consoleCopy.teamReward.endsOn}
              </label>
              <input
                id="reward-ends-on"
                ref={endsOnRef}
                type="date"
                required
                min={startsOn}
                aria-invalid={Boolean(
                  dateError && (!endsOn || endsOn < startsOn),
                )}
                aria-describedby={dateError ? "reward-date-error" : undefined}
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
              {dateError ? (
                <p
                  id="reward-date-error"
                  className="notice notice--error"
                  role="alert"
                >
                  {dateError}
                </p>
              ) : null}
              <label htmlFor="reward-days">
                {consoleCopy.teamReward.requiredDays}
              </label>
              <select
                id="reward-days"
                value={requiredDays}
                onChange={(event) => setRequiredDays(event.target.value)}
              >
                {Array.from({ length: 30 }, (_, index) => index + 1).map(
                  (day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ),
                )}
              </select>
              <label htmlFor="reward-percent">
                {consoleCopy.teamReward.participation}
              </label>
              <select
                id="reward-percent"
                value={minimumRosterPercent}
                onChange={(event) =>
                  setMinimumRosterPercent(event.target.value)
                }
              >
                {[50, 60, 70, 80, 90, 100].map((percent) => (
                  <option key={percent} value={percent}>
                    {consoleCopy.teamReward.participationOption(percent)}
                  </option>
                ))}
              </select>
              <button
                className="button button--lime"
                disabled={busy || imagePreparing || !title.trim()}
              >
                {busy ? staffCopy.working : consoleCopy.teamReward.publish}
              </button>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}

export function rewardDateDefaults(
  timeZone: string,
  now = new Date(),
): { startsOn: string; endsOn: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const startsOn = `${value("year")}-${value("month")}-${value("day")}`;
  const end = new Date(`${startsOn}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { startsOn, endsOn: end.toISOString().slice(0, 10) };
}
