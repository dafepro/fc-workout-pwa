"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "../../lib/analytics/AnalyticsProvider";
import { copy } from "../content/copy";
import {
  createPrizeBoxGateway,
  type PrizeBoxGateway,
} from "../data/prize-box-gateway";

export function TodayAdditionalAction({
  teamLocked,
  prizeBoxesConnected = false,
  prizeBoxGateway,
}: {
  teamLocked: boolean;
  prizeBoxesConnected?: boolean;
  prizeBoxGateway?: PrizeBoxGateway;
}) {
  const analytics = useAnalytics();
  const defaultPrizeBoxGateway = useMemo(
    () => createPrizeBoxGateway(prizeBoxesConnected),
    [prizeBoxesConnected],
  );
  const gateway = prizeBoxGateway ?? defaultPrizeBoxGateway;
  const [unopenedPrizeBoxes, setUnopenedPrizeBoxes] = useState(0);
  const [pendingPlanBoxes, setPendingPlanBoxes] = useState(0);

  useEffect(() => {
    if (!prizeBoxesConnected) return;
    let active = true;
    void gateway.overview().then(
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
  }, [gateway, prizeBoxesConnected]);

  const actions = [
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
