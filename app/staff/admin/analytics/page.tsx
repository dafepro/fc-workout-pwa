import { analyticsDatabase } from "../../../../lib/analytics/server";
import {
  readCachedAnalyticsOverview,
  type AnalyticsOverview,
} from "../../../../lib/analytics/storage";
import { ConsoleChrome, ConsoleSection } from "../../console/ConsoleChrome";
import { consoleCopy } from "../../console/copy";
import { AdminNav } from "../AdminNav";
import { requireOperator } from "../guard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireOperator();
  const database = analyticsDatabase();
  let overview: AnalyticsOverview | null = null;
  let unavailable = false;
  if (database) {
    try {
      overview = await readCachedAnalyticsOverview(database);
    } catch {
      unavailable = true;
    }
  }
  return (
    <ConsoleChrome title={consoleCopy.analytics.title}>
      <AdminNav />
      {!database ? (
        <ConsoleSection title={consoleCopy.analytics.notConfiguredTitle}>
          <p>{consoleCopy.analytics.notConfiguredBody}</p>
        </ConsoleSection>
      ) : unavailable || !overview ? (
        <ConsoleSection title={consoleCopy.analytics.unavailableTitle}>
          <p>{consoleCopy.analytics.unavailableBody}</p>
        </ConsoleSection>
      ) : (
        <AnalyticsOverviewView overview={overview} />
      )}
    </ConsoleChrome>
  );
}

function AnalyticsOverviewView({ overview }: { overview: AnalyticsOverview }) {
  const maxHour = Math.max(
    1,
    ...overview.localHours.map((item) => item.events),
  );
  const showBreakdowns = overview.active30Days >= 5;
  return (
    <>
      <p className="console-help">{consoleCopy.analytics.privacyNote}</p>
      <section className="analytics-stats" aria-label="Player activity summary">
        <Metric label="Active in 24 hours" value={overview.activeToday} />
        <Metric label="Active in 7 days" value={overview.active7Days} />
        <Metric label="Active in 30 days" value={overview.active30Days} />
        <Metric
          label="Active minutes, 7 days"
          value={overview.activeMinutes7Days}
        />
        <Metric
          label="Training entries, 7 days"
          value={overview.trainingEntries7Days}
        />
        <Metric label="Cheers, 7 days" value={overview.reactions7Days} />
      </section>
      <ConsoleSection title={consoleCopy.analytics.capacityTitle}>
        <dl className="console-facts">
          <dt>Events stored in 24 hours</dt>
          <dd>{overview.rowsLast24Hours.toLocaleString()}</dd>
          <dt>Projected daily writes with retention</dt>
          <dd>{overview.estimatedDailyWrites.toLocaleString()}</dd>
          <dt>D1 daily write allowance used</dt>
          <dd>{overview.capacityPercent}% of 100,000 (conservative)</dd>
        </dl>
        <progress
          className="analytics-capacity"
          max="100"
          value={overview.capacityPercent}
          aria-label="D1 daily write allowance used"
        />
        <p>{consoleCopy.analytics.capacityHint}</p>
      </ConsoleSection>
      <div className="analytics-grid">
        <ConsoleSection title={consoleCopy.analytics.routesTitle}>
          {!showBreakdowns ? (
            <p>{consoleCopy.analytics.smallCohort}</p>
          ) : overview.topRoutes.length === 0 ? (
            <p>{consoleCopy.analytics.empty}</p>
          ) : (
            <div className="console-table-scroll">
              <table className="console-table">
                <thead>
                  <tr>
                    <th scope="col">Screen</th>
                    <th scope="col">Active minutes</th>
                    <th scope="col">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.topRoutes.map((route) => (
                    <tr key={route.route}>
                      <th scope="row">{routeLabel(route.route)}</th>
                      <td>{route.activeMinutes.toLocaleString()}</td>
                      <td>{route.visits.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ConsoleSection>
        <ConsoleSection title={consoleCopy.analytics.hoursTitle}>
          {!showBreakdowns ? (
            <p>{consoleCopy.analytics.smallCohort}</p>
          ) : overview.localHours.length === 0 ? (
            <p>{consoleCopy.analytics.empty}</p>
          ) : (
            <ol className="analytics-hours" aria-label="Events by local hour">
              {overview.localHours.map((item) => (
                <li key={item.hour}>
                  <span>{hourLabel(item.hour)}</span>
                  <span
                    className="analytics-hours__bar"
                    style={{
                      width: `${Math.max(3, (item.events / maxHour) * 100)}%`,
                    }}
                  />
                  <strong>{item.events.toLocaleString()}</strong>
                </li>
              ))}
            </ol>
          )}
        </ConsoleSection>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="console-card analytics-stat">
      <p>{label}</p>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}

function routeLabel(route: string): string {
  return route
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function hourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: "numeric",
  });
}
