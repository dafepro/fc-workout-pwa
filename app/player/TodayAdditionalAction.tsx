"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAnalytics } from "../../lib/analytics/AnalyticsProvider";
import { copy } from "../content/copy";
import type { PrizeBoxGateway } from "../data/prize-box-gateway";

export function TodayAdditionalAction({
  teamLocked,
  teamWorkout = null,
  prizeBoxesConnected = false,
  prizeBoxGateway,
}: {
  teamLocked: boolean;
  teamWorkout?: {
    activityName: string;
    targetValue: number;
    targetUnit: string;
    dueOn: string;
  } | null;
  prizeBoxesConnected?: boolean;
  prizeBoxGateway?: PrizeBoxGateway;
}) {
  const analytics = useAnalytics();
  const [unopenedPrizeBoxes, setUnopenedPrizeBoxes] = useState(0);
  const [pendingPlanBoxes, setPendingPlanBoxes] = useState(0);

  useEffect(() => {
    if (!prizeBoxesConnected || !prizeBoxGateway) return;
    let active = true;
    void prizeBoxGateway.overview().then(
      (overview) => {
        if (!active) return;
        setUnopenedPrizeBoxes(overview.readyCount);
        setPendingPlanBoxes(
          overview.unopened.filter(({ source }) => source !== "daily_check_in")
            .length,
        );
      },
      () => {
        if (!active) return;
        setUnopenedPrizeBoxes(0);
        setPendingPlanBoxes(0);
      },
    );
    return () => {
      active = false;
    };
  }, [prizeBoxGateway, prizeBoxesConnected]);

  const actions = [
    ...(teamWorkout
      ? [
          {
            href: "/log",
            icon: "★",
            title: copy.today.teamWorkout,
            detail: copy.today.teamWorkoutDetail(
              teamWorkout.activityName,
              teamWorkout.targetValue,
              teamWorkout.targetUnit,
              formatDueDate(teamWorkout.dueOn),
            ),
            badge: 0,
            track: true,
          },
        ]
      : []),
    {
      href: "/team",
      icon: "●●",
      title: copy.today.teamLounge,
      detail: teamLocked
        ? copy.today.teamLoungeLocked
        : copy.today.teamLoungeDetail,
      badge: 0,
      track: false,
    },
    {
      href: "/log/additional",
      icon: "+",
      title: copy.today.logAnother,
      detail: copy.today.logAnotherDetail,
      badge: 0,
      track: true,
    },
    {
      href: "/prizes",
      icon: "□",
      title: copy.today.prizeBoxes,
      detail: copy.today.prizeBoxesDetail,
      badge: unopenedPrizeBoxes,
      track: false,
    },
    {
      href: "/progress",
      icon: "↗",
      title: copy.today.yourMomentum,
      detail: copy.today.yourMomentumDetail,
      badge: 0,
      track: false,
    },
  ];

  return (
    <section
      className="today-secondary-actions"
      aria-labelledby="today-additional-title"
    >
      <h2 id="today-additional-title">{copy.today.moreForToday}</h2>
      {pendingPlanBoxes > 0 ? (
        <p className="today-secondary-actions__earned" role="status">
          {copy.today.prizeBoxEarned}
        </p>
      ) : null}
      <ul aria-label={copy.today.moreForToday}>
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              onClick={
                action.track
                  ? () =>
                      analytics.track("training_entry_started", {
                        source: "navigation",
                        defaulted_activity: false,
                      })
                  : undefined
              }
            >
              <span
                className="today-secondary-actions__icon"
                aria-hidden="true"
              >
                {action.icon}
              </span>
              <span>
                <strong>{action.title}</strong>
                <small>{action.detail}</small>
              </span>
              <span className="today-secondary-actions__trailing">
                {action.badge > 0 ? (
                  <span className="today-secondary-actions__badge">
                    {copy.today.prizeBoxesUnopened(action.badge)}
                  </span>
                ) : null}
                <span aria-hidden="true">›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
