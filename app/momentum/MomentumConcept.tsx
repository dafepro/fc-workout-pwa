"use client";

import { useState } from "react";
import { momentumContent as content } from "./content";

type ReviewTab = "concept" | "demo";
type DemoScenario = (typeof content.demo.scenarios)[number]["id"];

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

      {activeTab === "concept" ? <ConceptPanel /> : <DemoPanel />}
    </div>
  );
}

function ConceptPanel() {
  return (
    <section
      id="momentum-panel-concept"
      className="momentum-panel momentum-concept"
      role="tabpanel"
      aria-labelledby="momentum-tab-concept"
    >
      <section className="momentum-definition">
        <div className="momentum-definition__mark" aria-hidden="true">
          <span>↗</span>
        </div>
        <div>
          <p className="momentum-section-label">{content.definition.title}</p>
          <h2>{content.definition.lead}</h2>
          <p>{content.definition.body}</p>
        </div>
      </section>

      <section
        className="momentum-pillars"
        aria-label={content.definition.title}
      >
        {content.pillars.map((pillar) => (
          <article key={pillar.number}>
            <span>{pillar.number}</span>
            <h3>{pillar.title}</h3>
            <p>{pillar.body}</p>
          </article>
        ))}
      </section>

      <section className="momentum-rule-section">
        <div className="momentum-section-heading">
          <p className="momentum-section-label">Working business rules</p>
          <h2>{content.guardrailTitle}</h2>
        </div>
        <div className="momentum-rule-grid">
          {content.guardrails.map((rule, index) => (
            <article key={rule.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{rule.label}</h3>
                <p>{rule.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="momentum-concept__split">
        <section className="momentum-review-card momentum-review-card--dark">
          <p className="momentum-section-label">Non-negotiables</p>
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

        <section className="momentum-review-card momentum-suggestion-card">
          <p className="momentum-section-label">{content.suggestion.eyebrow}</p>
          <h2>{content.suggestion.title}</h2>
          <p>{content.suggestion.body}</p>
          <ul>
            {content.suggestion.inputs.map((input) => (
              <li key={input}>{input}</li>
            ))}
          </ul>
          <strong>{content.suggestion.output}</strong>
        </section>
      </div>

      <section className="momentum-review-card">
        <p className="momentum-section-label">Consolidation map</p>
        <dl className="momentum-consolidation">
          {content.consolidation.map((item) => (
            <div key={item.current}>
              <dt>{item.current}</dt>
              <dd>
                <span aria-hidden="true">→</span> {item.proposed}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="momentum-questions">
        <div>
          <p className="momentum-section-label">Product-owner review</p>
          <h2>{content.review.title}</h2>
          <p>{content.review.fullDraft}</p>
        </div>
        <ol>
          {content.review.questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function DemoPanel() {
  const [scenario, setScenario] = useState<DemoScenario>("plan");
  const [stretchChoice, setStretchChoice] = useState<"goal" | "stretch">(
    "goal",
  );
  const [alternativeSelected, setAlternativeSelected] = useState(false);
  const [recoveryLogged, setRecoveryLogged] = useState(false);
  const [consistencyMode, setConsistencyMode] = useState<"steady" | "tired">(
    "steady",
  );
  const [restRecorded, setRestRecorded] = useState(false);
  const [extraSaved, setExtraSaved] = useState(false);

  const activeScenario = content.demo.scenarios.find(
    (item) => item.id === scenario,
  );

  function resetScenario() {
    setStretchChoice("goal");
    setAlternativeSelected(false);
    setRecoveryLogged(false);
    setConsistencyMode("steady");
    setRestRecorded(false);
    setExtraSaved(false);
  }

  function chooseScenario(nextScenario: DemoScenario) {
    setScenario(nextScenario);
    resetScenario();
  }

  return (
    <section
      id="momentum-panel-demo"
      className="momentum-panel momentum-demo"
      role="tabpanel"
      aria-labelledby="momentum-tab-demo"
    >
      <header className="momentum-demo__bar">
        <div>
          <p className="momentum-section-label">{content.demo.label}</p>
          <p>{content.demo.instruction}</p>
        </div>
        <button
          type="button"
          className="momentum-reset"
          onClick={resetScenario}
        >
          <span aria-hidden="true">↻</span> {content.demo.reset}
        </button>
      </header>

      <nav className="momentum-scenarios" aria-label={content.demo.label}>
        {content.demo.scenarios.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={scenario === item.id}
            className={scenario === item.id ? "is-active" : ""}
            onClick={() => chooseScenario(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="momentum-demo__stage">
        <div className="momentum-phone" aria-label={content.demo.phoneLabel}>
          <PhoneHeader />
          <main className="momentum-phone__screen" aria-live="polite">
            {scenario === "plan" ? <PlanScreen /> : null}
            {scenario === "stretch" ? (
              <StretchScreen
                choice={stretchChoice}
                onChoice={setStretchChoice}
              />
            ) : null}
            {scenario === "alternative" ? (
              <AlternativeScreen
                selected={alternativeSelected}
                onSelect={() => setAlternativeSelected(true)}
              />
            ) : null}
            {scenario === "recovery" ? (
              <RecoveryScreen
                logged={recoveryLogged}
                onLog={() => setRecoveryLogged(true)}
              />
            ) : null}
            {scenario === "consistency" ? (
              <ConsistencyScreen
                mode={consistencyMode}
                onMode={setConsistencyMode}
              />
            ) : null}
            {scenario === "rest" ? (
              <RestScreen
                recorded={restRecorded}
                onRecord={() => setRestRecorded(true)}
              />
            ) : null}
            {scenario === "gauges" ? <GaugeLabScreen /> : null}
            {scenario === "team" ? <TeamHighlightsScreen /> : null}
            {scenario === "extras" ? (
              <ExtraLogsScreen
                saved={extraSaved}
                onSave={() => setExtraSaved(true)}
              />
            ) : null}
          </main>
          <PhoneNavigation active={scenario === "team" ? "Team" : "Today"} />
        </div>

        <aside className="momentum-rationale">
          <p className="momentum-section-label">Why this state</p>
          <h2>{activeScenario?.label}</h2>
          <ol>
            {content.rationale[scenario].map((point, index) => (
              <li key={point}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {point}
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
          <small>{content.demo.playerTeam}</small>
        </p>
      </div>
    </header>
  );
}

function MomentumTrail() {
  const copy = content.demo.gauge;
  return (
    <section className="momentum-trail-card">
      <div className="momentum-trail" role="img" aria-label={copy.accessible}>
        <div className="momentum-trail__copy">
          <span>{copy.label}</span>
          <strong>{copy.band}</strong>
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

function PlanScreen() {
  const copy = content.demo.plan;
  return (
    <>
      <MomentumTrail />
      <section className="momentum-prescription">
        <p className="momentum-phone__kicker">{copy.kicker}</p>
        <h2>{copy.title}</h2>
        <div className="momentum-prescription__activity">
          <span aria-hidden="true">↗</span>
          <div>
            <h3>{copy.activity}</h3>
            <p>{copy.duration}</p>
          </div>
        </div>
        <p className="momentum-prescription__instruction">{copy.instruction}</p>
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
          <summary>{copy.reasonTitle}</summary>
          <ul>
            {copy.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
        <button type="button" className="momentum-primary">
          {copy.action} <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="momentum-text-button">
          {copy.alternative}
        </button>
      </section>
    </>
  );
}

function StretchScreen({
  choice,
  onChoice,
}: {
  choice: "goal" | "stretch";
  onChoice: (choice: "goal" | "stretch") => void;
}) {
  const copy = content.demo.stretch;
  return (
    <>
      <section className="momentum-state-hero momentum-state-hero--complete">
        <div aria-hidden="true">✓</div>
        <p className="momentum-phone__kicker">{copy.kicker}</p>
        <h2>{copy.title}</h2>
      </section>
      <div className="momentum-toggle momentum-toggle--stacked">
        <button
          type="button"
          className={choice === "goal" ? "is-active" : ""}
          aria-pressed={choice === "goal"}
          onClick={() => onChoice("goal")}
        >
          {copy.goalAction}
        </button>
        <button
          type="button"
          className={choice === "stretch" ? "is-active" : ""}
          aria-pressed={choice === "stretch"}
          onClick={() => onChoice("stretch")}
        >
          {copy.stretchAction}
        </button>
      </div>
      <section className="momentum-effect-card">
        <span className="momentum-effect-card__chip">
          {choice === "stretch" ? copy.stretchResult : copy.goalResult}
        </span>
        <p>{choice === "stretch" ? copy.stretchBody : copy.goalBody}</p>
        <strong>{copy.closure}</strong>
      </section>
    </>
  );
}

function AlternativeScreen({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  const copy = content.demo.alternative;
  const options = [
    [copy.prescribed, copy.prescribedEffect, "full"],
    [copy.different, copy.differentEffect, "partial"],
    [copy.equivalent, copy.equivalentEffect, "safe"],
  ] as const;

  return (
    <>
      <p className="momentum-phone__kicker">{copy.kicker}</p>
      <h2>{copy.title}</h2>
      <div className="momentum-option-list">
        {options.map(([title, effect, kind]) => (
          <article
            key={title}
            className={
              selected && kind === "partial" ? "is-selected" : undefined
            }
          >
            <span aria-hidden="true">
              {kind === "full" ? "●" : kind === "safe" ? "◆" : "◐"}
            </span>
            <div>
              <h3>{title}</h3>
              <p>{effect}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="momentum-inline-note">{copy.note}</p>
      <button type="button" className="momentum-primary" onClick={onSelect}>
        {selected ? copy.selected : copy.action}
      </button>
    </>
  );
}

function RecoveryScreen({
  logged,
  onLog,
}: {
  logged: boolean;
  onLog: () => void;
}) {
  const copy = content.demo.recovery;
  return (
    <>
      <section className="momentum-state-hero momentum-state-hero--recovery">
        <div aria-hidden="true">≈</div>
        <p className="momentum-phone__kicker">{copy.kicker}</p>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </section>
      <section className="momentum-recovery-card">
        <span aria-hidden="true">☼</span>
        <div>
          <h3>{copy.suggestion}</h3>
          <p>{copy.detail}</p>
        </div>
      </section>
      <button type="button" className="momentum-primary" onClick={onLog}>
        {logged ? copy.complete : copy.action}
      </button>
      {logged ? <p className="momentum-success-note">{copy.effect}</p> : null}
      <p className="momentum-closure-note">{copy.closure}</p>
    </>
  );
}

function ConsistencyScreen({
  mode,
  onMode,
}: {
  mode: "steady" | "tired";
  onMode: (mode: "steady" | "tired") => void;
}) {
  const copy = content.demo.consistency;
  const tired = mode === "tired";
  return (
    <>
      <p className="momentum-phone__kicker">{copy.kicker}</p>
      <h2>{copy.title}</h2>
      <div className="momentum-toggle">
        <button
          type="button"
          className={!tired ? "is-active" : ""}
          aria-pressed={!tired}
          onClick={() => onMode("steady")}
        >
          {copy.steadyLabel}
        </button>
        <button
          type="button"
          className={tired ? "is-active" : ""}
          aria-pressed={tired}
          onClick={() => onMode("tired")}
        >
          {copy.tiredLabel}
        </button>
      </div>
      <section className="momentum-recommendation-card">
        <span aria-hidden="true">{tired ? "≈" : "↗"}</span>
        <p className="momentum-phone__kicker">{copy.explanation}</p>
        <h3>{tired ? copy.tiredTitle : copy.steadyTitle}</h3>
        <strong>{tired ? copy.tiredGoal : copy.steadyGoal}</strong>
        <p>{tired ? copy.tiredBody : copy.steadyBody}</p>
      </section>
      <p className="momentum-disclaimer">{copy.disclaimer}</p>
    </>
  );
}

function RestScreen({
  recorded,
  onRecord,
}: {
  recorded: boolean;
  onRecord: () => void;
}) {
  const copy = content.demo.rest;
  return (
    <>
      <section className="momentum-state-hero momentum-state-hero--rest">
        <div aria-hidden="true">☾</div>
        <p className="momentum-phone__kicker">{copy.kicker}</p>
        <h2>{recorded ? copy.completeTitle : copy.title}</h2>
        <p>{recorded ? copy.completeBody : copy.body}</p>
      </section>
      {!recorded ? (
        <button type="button" className="momentum-primary" onClick={onRecord}>
          {copy.action}
        </button>
      ) : (
        <section className="momentum-rest-reflection">
          <h3>{copy.reflection}</h3>
          <div>
            {copy.options.map((option) => (
              <button key={option} type="button">
                {option}
              </button>
            ))}
          </div>
          <p>{copy.privacy}</p>
        </section>
      )}
    </>
  );
}

function GaugeLabScreen() {
  const copy = content.demo.gauges;
  return (
    <>
      <p className="momentum-phone__kicker">{copy.kicker}</p>
      <h2>{copy.title}</h2>
      <p className="momentum-screen-intro">{copy.body}</p>
      <div className="momentum-gauge-lab">
        {copy.options.map((option, index) => (
          <article key={option.name}>
            <div
              className={`momentum-gauge-sample momentum-gauge-sample--${index + 1}`}
              role="img"
              aria-label={option.accessible}
            >
              {index === 0 ? (
                <div className="momentum-mini-trail" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <b>↗</b>
                </div>
              ) : null}
              {index === 1 ? (
                <span className="momentum-mini-bar" aria-hidden="true">
                  <i />
                </span>
              ) : null}
              {index === 2 ? (
                <span className="momentum-mini-orbit" aria-hidden="true">
                  ↗
                </span>
              ) : null}
              <div>
                <strong>{option.state}</strong>
                <small>{option.name}</small>
              </div>
            </div>
            <p>{option.note}</p>
          </article>
        ))}
      </div>
      <p className="momentum-band-key">{copy.bands}</p>
    </>
  );
}

function TeamHighlightsScreen() {
  const copy = content.demo.team;
  return (
    <>
      <p className="momentum-phone__kicker">{copy.kicker}</p>
      <h2>{copy.title}</h2>
      <section className="momentum-team-pulse">
        <div className="momentum-team-pulse__visual" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <p>{copy.pulseTitle}</p>
        <h3>{copy.pulseState}</h3>
        <span>{copy.pulseBody}</span>
      </section>
      <div className="momentum-highlight-list">
        <article>
          <span aria-hidden="true">↗</span>
          <div>
            <h3>{copy.steadyTitle}</h3>
            <p>{copy.steadyBody}</p>
          </div>
        </article>
        <article>
          <span aria-hidden="true">✓</span>
          <div>
            <h3>{copy.challengeTitle}</h3>
            <p>{copy.challengeBody}</p>
          </div>
        </article>
        <article>
          <span aria-hidden="true">✦</span>
          <div>
            <h3>{copy.cheerTitle}</h3>
            <p>{copy.cheerBody}</p>
          </div>
        </article>
      </div>
      <p className="momentum-private-note">{copy.privacy}</p>
    </>
  );
}

function ExtraLogsScreen({
  saved,
  onSave,
}: {
  saved: boolean;
  onSave: () => void;
}) {
  const copy = content.demo.extras;
  return (
    <>
      <p className="momentum-phone__kicker">{copy.kicker}</p>
      <h2>{copy.title}</h2>
      <div className="momentum-log-list">
        {copy.rows.map((row, index) => (
          <article key={row.activity}>
            <span
              className={`momentum-log-dot momentum-log-dot--${index + 1}`}
            />
            <div>
              <h3>{row.activity}</h3>
              <p>{row.effect}</p>
            </div>
            <small>{row.status}</small>
          </article>
        ))}
      </div>
      <button type="button" className="momentum-secondary" onClick={onSave}>
        {saved ? copy.saved : copy.action}
      </button>
      <p className="momentum-inline-note">{copy.note}</p>
    </>
  );
}

function PhoneNavigation({ active }: { active: "Today" | "Team" }) {
  return (
    <nav className="momentum-phone__nav" aria-label="Player navigation preview">
      {content.demo.nav.map((item, index) => (
        <span key={item} className={active === item ? "is-active" : ""}>
          <i aria-hidden="true">
            {index === 0 ? "●" : index === 1 ? "◇" : "○"}
          </i>
          {item}
        </span>
      ))}
    </nav>
  );
}
