"use client";

import { useState } from "react";
import { momentumContent as content } from "./content";

type ReviewTab = "concept" | "demo";
type FlowScreen = "today" | "alternative" | "checkin" | "complete" | "team";
type DayKind = "training" | "rest";
type ResultChoice = "goal" | "stretch";
type ActivityChoice = "prescribed" | "alternative" | "equivalent";

const screenStep: Record<FlowScreen, number> = {
  today: 0,
  alternative: 0,
  checkin: 1,
  complete: 2,
  team: 3,
};

export function MomentumConcept() {
  const [activeTab, setActiveTab] = useState<ReviewTab>("concept");

  function selectTab(tab: ReviewTab) {
    setActiveTab(tab);
    document.getElementById(`momentum-tab-${tab}`)?.focus();
  }

  return (
    <div className="page momentum-lab">
      <header className="momentum-lab__header">
        <div>
          <p className="momentum-lab__eyebrow">{content.header.eyebrow}</p>
          <h1>{content.header.title}</h1>
          <p className="momentum-lab__intro">{content.header.intro}</p>
        </div>
        <span className="momentum-lab__status">{content.header.status}</span>
      </header>

      <div
        className="momentum-tabs"
        role="tablist"
        aria-label={content.header.title}
      >
        {(["concept", "demo"] as const).map((tab) => (
          <button
            id={`momentum-tab-${tab}`}
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`momentum-panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            className={activeTab === tab ? "is-active" : ""}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              selectTab(tab === "concept" ? "demo" : "concept");
            }}
          >
            {content.tabs[tab]}
          </button>
        ))}
      </div>

      {activeTab === "concept" ? <ConceptPanel /> : <PlayerFlow />}
    </div>
  );
}

function ConceptPanel() {
  return (
    <section
      id="momentum-panel-concept"
      className="momentum-panel momentum-brief"
      role="tabpanel"
      aria-labelledby="momentum-tab-concept"
    >
      <section className="momentum-definition">
        <div className="momentum-definition__mark" aria-hidden="true">
          ↗
        </div>
        <div>
          <p className="momentum-section-label">{content.definition.eyebrow}</p>
          <h2>{content.definition.title}</h2>
          <p>{content.definition.body}</p>
          <strong>{content.definition.rule}</strong>
        </div>
      </section>

      <section className="momentum-flow-summary" aria-label="Momentum flow">
        {content.flow.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </section>

      <section
        className="momentum-pair"
        aria-label="Personal and Team Momentum"
      >
        {content.momentumPair.map((item, index) => (
          <article key={item.label} className={index === 1 ? "is-team" : ""}>
            <p className="momentum-section-label">{item.label}</p>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            <small>{item.private}</small>
          </article>
        ))}
      </section>

      <section className="momentum-folds">
        <header>
          <p className="momentum-section-label">{content.folds.eyebrow}</p>
          <h2>{content.folds.title}</h2>
        </header>
        <div>
          {content.folds.items.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="momentum-brief__split">
        <section className="momentum-safety-card">
          <p className="momentum-section-label">{content.safety.eyebrow}</p>
          <h2>{content.safety.title}</h2>
          <ul>
            {content.safety.points.map((point) => (
              <li key={point}>
                <span aria-hidden="true">✓</span>
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className="momentum-review-card">
          <p className="momentum-section-label">{content.review.eyebrow}</p>
          <h2>{content.review.title}</h2>
          <ol>
            {content.review.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
          <p>{content.review.fullDraft}</p>
        </section>
      </div>
    </section>
  );
}

function PlayerFlow() {
  const [screen, setScreen] = useState<FlowScreen>("today");
  const [dayKind, setDayKind] = useState<DayKind>("training");
  const [result, setResult] = useState<ResultChoice>("goal");
  const [activity, setActivity] = useState<ActivityChoice>("prescribed");
  const [feeling, setFeeling] = useState(0);
  const [recoveryLogged, setRecoveryLogged] = useState(false);

  function reset(nextDay: DayKind = dayKind) {
    setDayKind(nextDay);
    setScreen("today");
    setResult("goal");
    setActivity("prescribed");
    setFeeling(0);
    setRecoveryLogged(false);
  }

  const noteKey =
    screen === "team" ? "team" : dayKind === "rest" ? "rest" : screen;

  return (
    <section
      id="momentum-panel-demo"
      className="momentum-panel momentum-demo"
      role="tabpanel"
      aria-labelledby="momentum-tab-demo"
    >
      <header className="momentum-demo__bar">
        <div>
          <p className="momentum-section-label">{content.demo.eyebrow}</p>
          <p>{content.demo.instruction}</p>
        </div>
        <button
          type="button"
          className="momentum-reset"
          onClick={() => reset()}
        >
          <span aria-hidden="true">↻</span> {content.demo.reset}
        </button>
      </header>

      <div className="momentum-demo__controls">
        <div className="momentum-day-switch" aria-label={content.demo.dayLabel}>
          <span>{content.demo.dayLabel}</span>
          <button
            type="button"
            className={dayKind === "training" ? "is-active" : ""}
            aria-pressed={dayKind === "training"}
            onClick={() => reset("training")}
          >
            {content.demo.dayTraining}
          </button>
          <button
            type="button"
            className={dayKind === "rest" ? "is-active" : ""}
            aria-pressed={dayKind === "rest"}
            onClick={() => reset("rest")}
          >
            {content.demo.dayRest}
          </button>
        </div>
        <div className="momentum-flow-line" aria-label="Flow progress">
          {content.demo.steps.map((step, index) => (
            <span
              key={step}
              className={index <= screenStep[screen] ? "is-reached" : ""}
            >
              <i aria-hidden="true" />
              {step}
            </span>
          ))}
        </div>
      </div>

      <div className="momentum-demo__stage">
        <div className="momentum-phone" aria-label={content.demo.phoneLabel}>
          <PhoneHeader />
          <main className="momentum-phone__screen" aria-live="polite">
            {screen === "team" ? (
              <TeamScreen onBack={() => setScreen("today")} />
            ) : dayKind === "rest" ? (
              screen === "complete" ? (
                <RestComplete onTeam={() => setScreen("team")} />
              ) : (
                <RestToday onRecord={() => setScreen("complete")} />
              )
            ) : screen === "today" ? (
              <TodayScreen
                onCheckIn={() => setScreen("checkin")}
                onAlternative={() => setScreen("alternative")}
              />
            ) : screen === "alternative" ? (
              <AlternativeScreen
                onBack={() => setScreen("today")}
                onChoose={(choice) => {
                  setActivity(choice);
                  setScreen("checkin");
                }}
              />
            ) : screen === "checkin" ? (
              <CheckInScreen
                activity={activity}
                result={result}
                feeling={feeling}
                onResult={setResult}
                onFeeling={setFeeling}
                onBack={() =>
                  setScreen(activity === "prescribed" ? "today" : "alternative")
                }
                onSave={() => setScreen("complete")}
              />
            ) : (
              <CompleteScreen
                activity={activity}
                result={result}
                recoveryLogged={recoveryLogged}
                onRecovery={() => setRecoveryLogged(true)}
                onTeam={() => setScreen("team")}
                onFinish={() => reset("training")}
              />
            )}
          </main>
          <PhoneNavigation
            active={screen === "team" ? "Team" : "Today"}
            onToday={() => setScreen("today")}
            onTeam={() => setScreen("team")}
          />
        </div>

        <aside className="momentum-flow-notes">
          <p className="momentum-section-label">Flow notes</p>
          <ol>
            {content.demo.notes[noteKey].map((note, index) => (
              <li key={note}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {note}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}

function PhoneHeader() {
  return (
    <header className="momentum-phone__header">
      <strong className="momentum-phone__brand">
        <span aria-hidden="true">Z</span> {content.brand}
      </strong>
      <div className="momentum-phone__identity">
        <span aria-hidden="true">MC</span>
        <p>
          <strong>{content.demo.player}</strong>
          <small>{content.demo.team}</small>
        </p>
      </div>
    </header>
  );
}

function MomentumTrail({ kind }: { kind: "personal" | "team" }) {
  const copy =
    kind === "personal" ? content.demo.personalGauge : content.demo.teamGauge;
  return (
    <section className={`momentum-trail-card momentum-trail-card--${kind}`}>
      <div className="momentum-trail" role="img" aria-label={copy.accessible}>
        <div className="momentum-trail__copy">
          <span>{copy.label}</span>
          <strong>{copy.state}</strong>
          <small>{copy.detail}</small>
        </div>
        <div className="momentum-trail__path" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <b />
          <span>↗</span>
        </div>
      </div>
    </section>
  );
}

function TodayScreen({
  onCheckIn,
  onAlternative,
}: {
  onCheckIn: () => void;
  onAlternative: () => void;
}) {
  const copy = content.demo.today;
  return (
    <>
      <MomentumTrail kind="personal" />
      <section className="momentum-plan-card">
        <p className="momentum-phone__kicker">{copy.kicker}</p>
        <h2>{copy.title}</h2>
        <div className="momentum-plan-card__activity">
          <span aria-hidden="true">↗</span>
          <div>
            <h3>{copy.activity}</h3>
            <p>{copy.workload}</p>
          </div>
        </div>
        <p className="momentum-plan-card__instruction">{copy.instruction}</p>
        <div className="momentum-targets">
          <article>
            <span aria-hidden="true">✓</span>
            <strong>{copy.goal}</strong>
            <small>{copy.goalNote}</small>
          </article>
          <article>
            <span aria-hidden="true">↗</span>
            <strong>{copy.stretch}</strong>
            <small>{copy.stretchNote}</small>
          </article>
        </div>
        <details className="momentum-why">
          <summary>{copy.why}</summary>
          <ul>
            {copy.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
        <button type="button" className="momentum-primary" onClick={onCheckIn}>
          {copy.action} <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          className="momentum-text-button"
          onClick={onAlternative}
        >
          {copy.alternative}
        </button>
      </section>
    </>
  );
}

function AlternativeScreen({
  onBack,
  onChoose,
}: {
  onBack: () => void;
  onChoose: (choice: Exclude<ActivityChoice, "prescribed">) => void;
}) {
  const copy = content.demo.alternative;
  return (
    <>
      <button type="button" className="momentum-back" onClick={onBack}>
        <span aria-hidden="true">←</span> {copy.back}
      </button>
      <p className="momentum-phone__kicker">{copy.kicker}</p>
      <h2>{copy.title}</h2>
      <p className="momentum-screen-intro">{copy.intro}</p>
      <div className="momentum-alternatives">
        {copy.options.map((option, index) => (
          <button
            key={option.title}
            type="button"
            onClick={() => onChoose(index === 0 ? "alternative" : "equivalent")}
          >
            <span aria-hidden="true">{index === 0 ? "◐" : "◆"}</span>
            <div>
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
              <em>{option.effect}</em>
            </div>
            <i aria-hidden="true">→</i>
          </button>
        ))}
      </div>
    </>
  );
}

function CheckInScreen({
  activity,
  result,
  feeling,
  onResult,
  onFeeling,
  onBack,
  onSave,
}: {
  activity: ActivityChoice;
  result: ResultChoice;
  feeling: number;
  onResult: (result: ResultChoice) => void;
  onFeeling: (feeling: number) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const copy = content.demo.checkin;
  const alternative = activity !== "prescribed";
  const activityName =
    activity === "prescribed"
      ? content.demo.today.activity
      : content.demo.alternative.options[activity === "alternative" ? 0 : 1]
          .title;
  const goal = alternative ? copy.alternateGoal : copy.goal;
  const stretch = alternative ? copy.alternateStretch : copy.stretch;

  return (
    <>
      <button type="button" className="momentum-back" onClick={onBack}>
        <span aria-hidden="true">←</span> {copy.back}
      </button>
      <p className="momentum-phone__kicker">{copy.kicker}</p>
      <h2>{copy.title}</h2>
      <section className="momentum-checkin-card">
        <h3>{activityName}</h3>
        <div className="momentum-result-choices">
          <button
            type="button"
            aria-label={goal}
            className={result === "goal" ? "is-selected" : ""}
            aria-pressed={result === "goal"}
            onClick={() => onResult("goal")}
          >
            <strong>{goal}</strong>
            <small>{copy.goalNote}</small>
          </button>
          <button
            type="button"
            aria-label={stretch}
            className={result === "stretch" ? "is-selected" : ""}
            aria-pressed={result === "stretch"}
            onClick={() => onResult("stretch")}
          >
            <strong>{stretch}</strong>
            <small>{copy.stretchNote}</small>
          </button>
        </div>
        <fieldset>
          <legend>{copy.feeling}</legend>
          <div className="momentum-feelings">
            {copy.feelings.map((label, index) => (
              <button
                key={label}
                type="button"
                className={feeling === index ? "is-selected" : ""}
                aria-pressed={feeling === index}
                onClick={() => onFeeling(index)}
              >
                <span aria-hidden="true">
                  {index === 0 ? "●" : index === 1 ? "◐" : "○"}
                </span>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="momentum-private-note">{copy.privacy}</p>
      </section>
      <button type="button" className="momentum-primary" onClick={onSave}>
        {copy.action}
      </button>
    </>
  );
}

function CompleteScreen({
  activity,
  result,
  recoveryLogged,
  onRecovery,
  onTeam,
  onFinish,
}: {
  activity: ActivityChoice;
  result: ResultChoice;
  recoveryLogged: boolean;
  onRecovery: () => void;
  onTeam: () => void;
  onFinish: () => void;
}) {
  const copy = content.demo.complete;
  const effect =
    activity === "alternative"
      ? copy.alternativeEffect
      : result === "stretch"
        ? copy.stretchEffect
        : copy.goalEffect;
  const recoverySuggested = activity !== "alternative";

  return (
    <>
      <section className="momentum-complete-hero">
        <div aria-hidden="true">✓</div>
        <p className="momentum-phone__kicker">{copy.kicker}</p>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <strong>{effect}</strong>
      </section>
      {recoverySuggested ? (
        <section className="momentum-recovery-card">
          <span aria-hidden="true">≈</span>
          <div>
            <p className="momentum-phone__kicker">{copy.recoveryKicker}</p>
            <h3>{copy.recoveryTitle}</h3>
            <p>{copy.recoveryBody}</p>
          </div>
          <button type="button" onClick={onRecovery}>
            {recoveryLogged ? copy.recoveryLogged : copy.recoveryAction}
          </button>
        </section>
      ) : null}
      <button type="button" className="momentum-primary" onClick={onTeam}>
        {copy.teamAction} <span aria-hidden="true">→</span>
      </button>
      <button type="button" className="momentum-secondary" onClick={onFinish}>
        {copy.finish}
      </button>
      <details className="momentum-more-activity">
        <summary>{copy.extraSummary}</summary>
        <p>{copy.extraBody}</p>
      </details>
    </>
  );
}

function RestToday({ onRecord }: { onRecord: () => void }) {
  const copy = content.demo.rest;
  return (
    <>
      <MomentumTrail kind="personal" />
      <section className="momentum-rest-card">
        <div aria-hidden="true">☾</div>
        <p className="momentum-phone__kicker">{copy.kicker}</p>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <button type="button" className="momentum-primary" onClick={onRecord}>
          {copy.action}
        </button>
        <small>{copy.privacy}</small>
      </section>
    </>
  );
}

function RestComplete({ onTeam }: { onTeam: () => void }) {
  const copy = content.demo.rest;
  return (
    <>
      <section className="momentum-rest-card momentum-rest-card--complete">
        <div aria-hidden="true">✓</div>
        <p className="momentum-phone__kicker">{copy.completeKicker}</p>
        <h2>{copy.completeTitle}</h2>
        <p>{copy.completeBody}</p>
      </section>
      <button type="button" className="momentum-primary" onClick={onTeam}>
        {copy.teamAction} <span aria-hidden="true">→</span>
      </button>
    </>
  );
}

function TeamScreen({ onBack }: { onBack: () => void }) {
  const copy = content.demo.teamView;
  return (
    <>
      <button type="button" className="momentum-back" onClick={onBack}>
        <span aria-hidden="true">←</span> {copy.back}
      </button>
      <p className="momentum-phone__kicker">{copy.kicker}</p>
      <h2>{copy.title}</h2>
      <MomentumTrail kind="team" />
      <section className="momentum-team-card">
        <h3>{copy.pulseTitle}</h3>
        <p>{copy.pulseBody}</p>
        <div className="momentum-team-faces" aria-label={copy.pulseBody}>
          {copy.names.map((name) => (
            <span key={name} title={name}>
              {name.slice(0, 2)}
            </span>
          ))}
        </div>
        <div className="momentum-team-highlight">
          <span aria-hidden="true">↗</span>
          <div>
            <strong>{copy.highlight}</strong>
            <p>{copy.highlightBody}</p>
          </div>
        </div>
        <small>{copy.privacy}</small>
      </section>
    </>
  );
}

function PhoneNavigation({
  active,
  onToday,
  onTeam,
}: {
  active: "Today" | "Team";
  onToday: () => void;
  onTeam: () => void;
}) {
  return (
    <nav className="momentum-phone__nav" aria-label="Player navigation preview">
      {content.demo.nav.map((item, index) => (
        <button
          key={item}
          type="button"
          className={active === item ? "is-active" : ""}
          onClick={
            item === "Today" ? onToday : item === "Team" ? onTeam : undefined
          }
        >
          <i aria-hidden="true">
            {index === 0 ? "●" : index === 1 ? "◇" : "○"}
          </i>
          {item}
        </button>
      ))}
    </nav>
  );
}
