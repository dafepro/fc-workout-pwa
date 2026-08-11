"use client";

import { useEffect, useState } from "react";

export function TransientQueryToast({
  parameter,
  value,
  message,
}: {
  parameter: string;
  value: string;
  message: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(parameter) !== value) return;

    url.searchParams.delete(parameter);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    const showTimer = window.setTimeout(() => setVisible(true), 0);
    const hideTimer = window.setTimeout(() => setVisible(false), 4200);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [parameter, value]);

  if (!visible) return null;

  return (
    <div className="toast-overlay" role="status">
      <span aria-hidden="true">✓</span>
      <strong>{message}</strong>
    </div>
  );
}
