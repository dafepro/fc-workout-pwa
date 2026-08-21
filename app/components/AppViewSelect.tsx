"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { appViewCopy, appViews, type AppView } from "../content/app-views";

export function AppViewSelect({ currentView }: { currentView: AppView }) {
  const router = useRouter();
  const id = useId();
  const current = appViews.find((view) => view.id === currentView)!;

  return (
    <div className="app-view-select">
      <label htmlFor={id}>{appViewCopy.label}</label>
      <select
        id={id}
        value={current.href}
        onChange={(event) => router.push(event.target.value)}
      >
        {appViews.map((view) => (
          <option key={view.id} value={view.href}>
            {view.label}
          </option>
        ))}
      </select>
    </div>
  );
}
