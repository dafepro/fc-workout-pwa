"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  connectedDailyDropGateway,
  type DailyDropGateway,
} from "../../data/daily-drop-gateway";
import { playerExperienceCopy } from "../content";

export function TodaySecondaryActions({
  teamLocked,
  prizeBoxesConnected = false,
  prizeBoxGateway = connectedDailyDropGateway,
}: {
  teamLocked: boolean;
  prizeBoxesConnected?: boolean;
  prizeBoxGateway?: DailyDropGateway;
}) {
  const copy = playerExperienceCopy.focusedToday;
  const [prizeBoxAvailable, setPrizeBoxAvailable] = useState(false);

  useEffect(() => {
    if (!prizeBoxesConnected) return;
    let active = true;
    void prizeBoxGateway.status().then(
      (status) => active && setPrizeBoxAvailable(status.state === "available"),
      () => active && setPrizeBoxAvailable(false),
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
      badge: false,
    },
    {
      href: "/log/additional",
      icon: "+",
      title: copy.logAnother,
      detail: copy.logAnotherDetail,
      badge: false,
    },
    {
      href: "/prizes",
      icon: "□",
      title: copy.prizeBoxes,
      detail: copy.prizeBoxesDetail,
      badge: prizeBoxesConnected && prizeBoxAvailable,
    },
    {
      href: "/progress",
      icon: "↗",
      title: copy.yourMomentum,
      detail: copy.yourMomentumDetail,
      badge: false,
    },
  ];

  return (
    <section className="today-secondary-actions">
      <h2>{copy.otherTitle}</h2>
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
                {action.badge ? (
                  <span className="today-secondary-actions__badge">
                    {copy.prizeBoxesUnopened(1)}
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
