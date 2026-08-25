"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  connectedPrizeBoxGateway,
  type PrizeBoxGateway,
} from "../../data/prize-box-gateway";
import { playerExperienceCopy } from "../content";

export function TodaySecondaryActions({
  teamLocked,
  prizeBoxesConnected = false,
  prizeBoxGateway = connectedPrizeBoxGateway,
}: {
  teamLocked: boolean;
  prizeBoxesConnected?: boolean;
  prizeBoxGateway?: PrizeBoxGateway;
}) {
  const copy = playerExperienceCopy.focusedToday;
  const [unopenedPrizeBoxes, setUnopenedPrizeBoxes] = useState(0);
  const [pendingPlanBoxes, setPendingPlanBoxes] = useState(0);

  useEffect(() => {
    if (!prizeBoxesConnected) return;
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
    {
      href: "/team",
      icon: "●●",
      title: copy.teamLounge,
      detail: teamLocked ? copy.teamLoungeLocked : copy.teamLoungeDetail,
      badge: 0,
    },
    {
      href: "/log/additional",
      icon: "+",
      title: copy.logAnother,
      detail: copy.logAnotherDetail,
      badge: 0,
    },
    {
      href: "/prizes",
      icon: "□",
      title: copy.prizeBoxes,
      detail: copy.prizeBoxesDetail,
      badge: prizeBoxesConnected ? unopenedPrizeBoxes : 0,
    },
    {
      href: "/progress",
      icon: "↗",
      title: copy.yourMomentum,
      detail: copy.yourMomentumDetail,
      badge: 0,
    },
  ];

  return (
    <section className="today-secondary-actions">
      <h2>{copy.otherTitle}</h2>
      {pendingPlanBoxes > 0 ? (
        <p className="today-secondary-actions__earned" role="status">
          {copy.prizeBoxEarned}
        </p>
      ) : null}
      <ul aria-label={copy.otherTitle}>
        {actions.map((action) => (
          <li key={action.href}>
            <Link href={action.href}>
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
                    {copy.prizeBoxesUnopened(action.badge)}
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
