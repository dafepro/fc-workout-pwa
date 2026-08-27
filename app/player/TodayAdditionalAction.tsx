"use client";

import Link from "next/link";
import { copy } from "../content/copy";
import { useAnalytics } from "../../lib/analytics/AnalyticsProvider";

export function TodayAdditionalAction() {
  const analytics = useAnalytics();

  return (
    <section
      className="card today-additional-action"
      aria-labelledby="today-additional-title"
    >
      <h2 id="today-additional-title">{copy.today.moreForToday}</h2>
      <Link
        href="/log"
        onClick={() =>
          analytics.track("training_entry_started", {
            source: "navigation",
            defaulted_activity: true,
          })
        }
      >
        <span>
          <strong>{copy.today.logAnother}</strong>
          <small>{copy.today.logAnotherDetail}</small>
        </span>
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
