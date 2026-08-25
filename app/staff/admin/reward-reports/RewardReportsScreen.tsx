"use client";

import { useState } from "react";

import { routes } from "../../../content/routes";
import { AdminNav } from "../AdminNav";
import { ConfirmButton } from "../../console/ConfirmButton";
import { ConsoleChrome, ConsoleNotice } from "../../console/ConsoleChrome";
import { consoleRequest, messageFor } from "../../console/api";
import { consoleCopy } from "../../console/copy";
import { useResource } from "../../console/useResource";

interface RewardReport {
  id: string;
  rewardId: string;
  teamId: string;
  teamName: string;
  prizeTitle: string;
  reason: keyof typeof consoleCopy.rewardReports.reasons;
  status: "open" | "resolved";
  resolution?: "hide" | "cancel";
  createdAt: string;
  resolvedAt?: string;
}

export function RewardReportsScreen() {
  const [actionError, setActionError] = useState("");
  const resource = useResource<{ items: RewardReport[] }>(
    "v1/staff/reward-reports",
  );

  async function resolve(reportId: string, resolution: "hide" | "cancel") {
    setActionError("");
    try {
      await consoleRequest(`v1/staff/reward-reports/${reportId}/resolve`, {
        method: "POST",
        body: { resolution },
      });
      resource.reload();
    } catch (error) {
      setActionError(messageFor(error));
    }
  }

  return (
    <ConsoleChrome
      title={consoleCopy.rewardReports.title}
      back={{ href: routes.staffAdmin, label: consoleCopy.admin.backToSearch }}
    >
      <AdminNav />
      <p>{consoleCopy.rewardReports.intro}</p>
      {resource.error ? <ConsoleNotice message={resource.error} /> : null}
      {actionError ? <ConsoleNotice message={actionError} /> : null}
      {resource.loading && !resource.data ? <p>{consoleCopy.loading}</p> : null}
      {resource.data?.items.length === 0 ? (
        <p>{consoleCopy.rewardReports.empty}</p>
      ) : null}
      <div className="reward-report-queue">
        {resource.data?.items.map((report) => (
          <article className="console-card" key={report.id}>
            <p className="console-eyebrow">{report.teamName}</p>
            <h2 className="console-card__title">{report.prizeTitle}</h2>
            <p>
              <strong>
                {consoleCopy.rewardReports.reasons[report.reason]}
              </strong>
            </p>
            <time dateTime={report.createdAt}>
              {new Date(report.createdAt).toLocaleString()}
            </time>
            {report.status === "open" ? (
              <div className="console-actions">
                <ConfirmButton
                  label={consoleCopy.rewardReports.hide}
                  question={consoleCopy.rewardReports.hideQuestion}
                  confirmLabel={consoleCopy.rewardReports.confirmHide}
                  onConfirm={() => resolve(report.id, "hide")}
                />
                <ConfirmButton
                  label={consoleCopy.rewardReports.cancel}
                  question={consoleCopy.rewardReports.cancelQuestion}
                  confirmLabel={consoleCopy.rewardReports.confirmCancel}
                  onConfirm={() => resolve(report.id, "cancel")}
                />
              </div>
            ) : (
              <p className="console-hint">
                {consoleCopy.rewardReports.resolved}: {report.resolution}
              </p>
            )}
          </article>
        ))}
      </div>
    </ConsoleChrome>
  );
}
