"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../../domain/types";
import { playerExperienceCopy } from "../content";

const copy = playerExperienceCopy.planTimeline;

interface TodayDetails {
  activity: string;
  workload: string;
  goal: string;
  instruction: string;
}

export function PlanTimeline({
  plan,
  todayDetails,
  children,
  footer,
}: {
  plan: TrainingPlanWindow;
  todayDetails: TodayDetails;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const days = useMemo(() => timelineDays(plan), [plan]);
  const todayIndex = Math.max(
    0,
    days.findIndex((day) => day.dayIndex === plan.today.dayIndex),
  );
  const contextKey = `${plan.planId}:${plan.today.dayIndex}`;
  const [selection, setSelection] = useState({
    contextKey,
    index: todayIndex,
  });
  const selectedIndex =
    selection.contextKey === contextKey ? selection.index : todayIndex;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const scrollTimerRef = useRef<number | null>(null);
  const selectedIsToday = selectedIndex === todayIndex;

  const selectDay = useCallback(
    (index: number, smooth = true) => {
      setSelection({ contextKey, index });
      cardsRef.current[index]?.scrollIntoView?.({
        behavior: smooth ? "smooth" : "auto",
        block: "nearest",
        inline: "center",
      });
    },
    [contextKey],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      cardsRef.current[todayIndex]?.scrollIntoView?.({
        behavior: "auto",
        block: "nearest",
        inline: "center",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contextKey, todayIndex]);

  useEffect(
    () => () => {
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    },
    [],
  );

  function settleSelection() {
    if (scrollTimerRef.current !== null) {
      window.clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = window.setTimeout(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const bounds = scroller.getBoundingClientRect();
      const center = bounds.left + bounds.width / 2;
      let closestIndex = selectedIndex;
      let closestDistance = Number.POSITIVE_INFINITY;
      cardsRef.current.forEach((card, index) => {
        if (!card) return;
        const cardBounds = card.getBoundingClientRect();
        const distance = Math.abs(
          cardBounds.left + cardBounds.width / 2 - center,
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      setSelection({ contextKey, index: closestIndex });
    }, 90);
  }

  return (
    <section className="whats-next plan-timeline" aria-label={copy.regionLabel}>
      <header className="plan-timeline__heading">
        <div>
          <p className="player-eyebrow">
            {copy.coachPlan} · Day {plan.dayNumber} of {plan.dayCount}
          </p>
          <h2>{plan.templateName}</h2>
        </div>
        <span>{focusLabel(plan.today.focus)}</span>
      </header>

      <div className="plan-timeline__viewport">
        <div
          className="plan-timeline__track"
          ref={scrollerRef}
          onScroll={settleSelection}
          aria-label={copy.daysLabel}
        >
          {days.map((day, index) => (
            <PlanDayCard
              key={`${day.planId}-${day.dayIndex}`}
              day={day}
              today={plan.today}
              selected={selectedIndex === index}
              todayDetails={todayDetails}
              onSelect={() => selectDay(index)}
              buttonRef={(node) => {
                cardsRef.current[index] = node;
              }}
            />
          ))}
        </div>
      </div>

      <p className="plan-timeline__swipe-hint" aria-hidden="true">
        <span>←</span> {copy.swipeHint} <span>→</span>
      </p>

      <div className="plan-timeline__action" aria-live="polite">
        {selectedIsToday ? (
          children
        ) : (
          <button
            className="plan-timeline__return"
            type="button"
            onClick={() => selectDay(todayIndex)}
          >
            <span aria-hidden="true">↶</span>
            {copy.jumpToday}
          </button>
        )}
      </div>

      {footer ? <div className="plan-timeline__footer">{footer}</div> : null}

      <p className="plan-timeline__policy">{copy.policy}</p>
    </section>
  );
}

function PlanDayCard({
  day,
  today,
  selected,
  todayDetails,
  onSelect,
  buttonRef,
}: {
  day: CurrentTrainingPlanDay;
  today: CurrentTrainingPlanDay;
  selected: boolean;
  todayDetails: TodayDetails;
  onSelect(): void;
  buttonRef(node: HTMLButtonElement | null): void;
}) {
  const relation =
    day.dayIndex === today.dayIndex
      ? "today"
      : day.dayIndex < today.dayIndex
        ? "past"
        : "future";
  const activity = activityLabel(day);
  const state = dayState(day, relation);
  const label = relation === "today" ? copy.today : weekday(day.occursOn);
  const details =
    relation === "today"
      ? todayDetails
      : {
          activity,
          workload:
            day.kind === "rest"
              ? copy.recoveryDay
              : `${day.durationMinutes} min · ${focusLabel(day.intensity)}`,
          goal: state.detail,
          instruction:
            relation === "future"
              ? copy.comeBack(weekday(day.occursOn))
              : state.detail,
        };

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`plan-day-card is-${relation} is-${state.key} ${selected ? "is-selected" : ""}`}
      aria-label={`${label}, ${activity}, ${state.accessible}`}
      aria-current={relation === "today" ? "date" : undefined}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="plan-day-card__topline">
        <span className="plan-day-card__day">{label}</span>
        <span className="plan-day-card__state-icon" aria-hidden="true">
          {state.key === "locked" ? (
            <span className="plan-day-card__padlock" />
          ) : (
            state.icon
          )}
        </span>
      </span>
      <span className="plan-day-card__eyebrow">
        {relation === "today" ? copy.whatsNext : state.label}
      </span>
      <strong>{details.activity}</strong>
      <span className="plan-day-card__workload">{details.workload}</span>
      {relation === "today" ? (
        <span className="plan-day-card__goal">{details.goal}</span>
      ) : null}
      {relation === "today" || details.instruction !== state.label ? (
        <span className="plan-day-card__instruction">
          {details.instruction}
        </span>
      ) : null}
      {relation === "future" ? (
        <span className="plan-day-card__lock">
          <span className="plan-day-card__padlock" aria-hidden="true" />
          {copy.locked}
        </span>
      ) : null}
    </button>
  );
}

function timelineDays(plan: TrainingPlanWindow): CurrentTrainingPlanDay[] {
  if (plan.days?.length > 0) return plan.days;
  return [plan.yesterday, plan.today, plan.tomorrow].filter(
    (day): day is CurrentTrainingPlanDay => day !== null,
  );
}

function dayState(
  day: CurrentTrainingPlanDay,
  relation: "past" | "today" | "future",
): {
  key: string;
  label: string;
  detail: string;
  accessible: string;
  icon: string;
} {
  if (relation === "future") {
    return {
      key: "locked",
      label: copy.locked,
      detail: copy.comeBack(weekday(day.occursOn)),
      accessible: "locked",
      icon: "",
    };
  }
  if (relation === "today") {
    return {
      key: day.completed ? "completed" : "current",
      label: day.completed ? copy.completed : copy.today,
      detail: day.completed ? copy.completed : copy.currentWorkout,
      accessible: day.completed ? "completed today" : "current workout",
      icon: day.completed ? "✓" : "●",
    };
  }
  if (day.kind === "rest") {
    return {
      key: "rest",
      label: copy.plannedRest,
      detail: day.completed ? copy.restCheckedIn : copy.plannedRest,
      accessible: "planned rest day",
      icon: "☾",
    };
  }
  if (day.completed) {
    return {
      key: "completed",
      label: copy.completed,
      detail: copy.completed,
      accessible: "completed",
      icon: "✓",
    };
  }
  return {
    key: "missed",
    label: copy.missed,
    detail: copy.missedDetail,
    accessible: "missed",
    icon: "×",
  };
}

function activityLabel(day: CurrentTrainingPlanDay): string {
  if (day.kind === "rest") return copy.plannedRest;
  return (
    day.blocks.find((block) => !block.completed)?.label ??
    day.blocks.at(-1)?.label ??
    focusLabel(day.focus)
  );
}

function weekday(dayKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T12:00:00Z`));
}

function focusLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
