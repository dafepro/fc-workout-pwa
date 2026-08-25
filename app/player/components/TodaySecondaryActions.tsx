import Link from "next/link";
import { playerExperienceCopy } from "../content";

export function TodaySecondaryActions({ teamLocked }: { teamLocked: boolean }) {
  const copy = playerExperienceCopy.focusedToday;
  const actions = [
    {
      href: "/team",
      icon: "●●",
      title: copy.teamLounge,
      detail: teamLocked ? copy.teamLoungeLocked : copy.teamLoungeDetail,
    },
    {
      href: "/log/additional",
      icon: "+",
      title: copy.logAnother,
      detail: copy.logAnotherDetail,
    },
    {
      href: "/prizes",
      icon: "□",
      title: copy.prizeBoxes,
      detail: copy.prizeBoxesDetail,
    },
    {
      href: "/progress",
      icon: "↗",
      title: copy.yourMomentum,
      detail: copy.yourMomentumDetail,
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
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
