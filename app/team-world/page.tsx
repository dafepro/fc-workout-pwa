"use client";
import { lazy, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "../state/auth-context";
import { worldCopy as copy } from "./copy";
const World = lazy(() => import("./TeamWorld"));
export default function TeamWorldPage() {
  const { connected, runtime } = useAuth();
  return (
    <section className="page">
      <header>
        <Link href="/team">{copy.back}</Link>
        <h1>{copy.title}</h1>
      </header>
      {connected ? (
        <Suspense fallback={<p role="status">{copy.loading}</p>}>
          <World key={runtime.currentTeam.id} teamID={runtime.currentTeam.id} />
        </Suspense>
      ) : (
        <p role="status">{copy.connectedOnly}</p>
      )}
    </section>
  );
}
