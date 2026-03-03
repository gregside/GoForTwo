import { useState } from "react";
import "./App.css";

// ── Helpers ──────────────────────────────────────────────
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// ── Scenario formulas ────────────────────────────────────
/**
 * Scenario 1 — Down 8 (was -14, scored TD)
 * Need: onside kick → TD → correct conversions to tie → OT
 *
 * "Kick XP" adaptive strategy:
 *   XP on 1st TD. If it hits (down 7), XP on 2nd TD ties → OT.
 *   If 1st XP misses (down 8), go for 2 on 2nd TD to tie → OT.
 *   P = P(Onside)·P(TD)·[P(XP)²+(1−P(XP))·P(2P)]·P(OT)
 *
 * "Go for 2" first strategy:
 *   2P on 1st TD. If it hits (down 6), after 2nd TD you're tied;
 *     kick XP to go ahead(WIN) or miss(OT).
 *   If 1st 2P misses (still down 8), go for 2 on 2nd TD to tie → OT.
 *   P = P(Onside)·P(TD)·[P(2P)·(P(XP)+(1−P(XP))·P(OT))
 *                          +(1−P(2P))·P(2P)·P(OT)]
 */
function down8(
  onside: number,
  td: number,
  ot: number,
  xp: number,
  twoP: number,
) {
  const base = onside * td;
  const xpStrat = base * (xp * xp + (1 - xp) * twoP) * ot;
  const twoPStrat =
    base * (twoP * (xp + (1 - xp) * ot) + (1 - twoP) * twoP * ot);
  return { xp: xpStrat, twoP: twoPStrat };
}

/**
 * Scenario 2 — Down 4 (was -10, scored TD)
 * Need: onside kick → TD to take the lead.
 *
 * Regardless of conversion choice on the first TD, after the
 * second TD you are ahead (+2 to +4), so conversion doesn't
 * change the win probability on the onside-TD path.
 *
 * However, kicking the XP (down 3) vs going for 2 (down 2 or 4)
 * affects survival if the opponent scores before you get the
 * onside attempt.  A simplified model:
 *
 * Kick XP → -3: if opponent scores FG you're -6 → need onside+TD+2P to tie
 *   P = P(XP)·[P(Onside)·P(TD)
 *              – risk_adj·P(Onside)·P(TD)]   (simplified → just the direct path)
 *
 * For this POC we model the direct onside-TD path only:
 *   "Kick XP"  → P(Onside)·P(TD)  (ahead after 2nd TD → WIN)
 *   "Go for 2" → P(Onside)·P(TD)  (also ahead → WIN)
 *
 * Since direct paths are equal, we add the *safety-valve* edge:
 *   If you go for 2 and make it (down 2), a FG drive (without
 *   onside) wins outright. Modeled as bonus: P(2P)·P(TD)·0.33 (proxy).
 *   If XP (down 3), a FG ties → OT: P(XP)·P(TD)·0.33·P(OT).
 *
 * Simplified combined formulas shown in the dashboard:
 *   XP strat:  P(Onside)·P(TD) + (1-P(Onside))·P(XP)·P(TD)·P(OT)
 *   2P strat:  P(Onside)·P(TD) + (1-P(Onside))·P(2P)·P(TD)
 */
function down4(
  onside: number,
  td: number,
  ot: number,
  xp: number,
  twoP: number,
) {
  // Direct onside-TD path: win regardless of conversion
  const direct = onside * td;
  // Secondary path: no onside, but get the ball back normally.
  // XP→-3: need FG to tie → OT
  const xpStrat = direct + (1 - onside) * xp * td * ot;
  // 2P→-2: need FG to go ahead → WIN
  const twoPStrat = direct + (1 - onside) * twoP * td;
  return { xp: xpStrat, twoP: twoPStrat };
}

/**
 * Scenario 3 — Down 1 (was -7, scored TD)
 * Immediate conversion decision:
 *   Kick XP → tied → OT → P(XP)·P(OT)
 *   Go for 2 → take the lead → P(2P)
 */
function down1(
  _onside: number,
  _td: number,
  ot: number,
  xp: number,
  twoP: number,
) {
  return { xp: xp * ot, twoP: twoP };
}

// ── Scenario metadata ────────────────────────────────────
interface Scenario {
  label: string;
  title: string;
  desc: string;
  calc: typeof down8;
  xpFormula: string;
  twoPFormula: string;
}

const SCENARIOS: Scenario[] = [
  {
    label: "Down 8",
    title: "Down 14 → Score TD → Down 8",
    desc: "Two-score game. You need an onside kick, another TD, and the right conversions to tie before overtime.",
    calc: down8,
    xpFormula: "P(Onside)·P(TD)·[P(XP)² + (1−P(XP))·P(2P)]·P(OT)",
    twoPFormula:
      "P(Onside)·P(TD)·[P(2P)·(P(XP)+(1−P(XP))·P(OT)) + (1−P(2P))·P(2P)·P(OT)]",
  },
];

// ── Slider input component ──────────────────────────────
function ProbSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="input-group">
      <label>{label}</label>
      <div className="slider-row">
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={value * 100}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
        />
        <span className="pct-value">{pct(value)}</span>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────
function App() {
  // Probability inputs (reasonable NFL defaults)
  const [onside, setOnside] = useState(0.065); // ~10 %
  const [td, setTd] = useState(0.35); // ~35 %
  const [ot, setOt] = useState(0.5); // coin-flip
  const [xp, setXp] = useState(0.95); // ~95 %
  const [twoP, setTwoP] = useState(0.48); // ~48 %

  const [tab, setTab] = useState(0);

  const scenario = SCENARIOS[tab];
  const result = scenario.calc(onside, td, ot, xp, twoP);
  const edge = result.twoP - result.xp;

  return (
    <>
      <h1>Go For Two?</h1>
      <p className="subtitle">NFL 2-point conversion decision dashboard</p>

      {/* Probability Inputs */}
      <div className="inputs-panel">
        <h2>Probability Inputs</h2>
        <div className="input-grid">
          <ProbSlider
            label="Onside Kick Recovery"
            value={onside}
            onChange={setOnside}
          />
          <ProbSlider label="Score a Touchdown" value={td} onChange={setTd} />
          <ProbSlider label="Win in Overtime" value={ot} onChange={setOt} />
          <ProbSlider label="Extra Point (XP)" value={xp} onChange={setXp} />
          <ProbSlider
            label="2-Point Conversion"
            value={twoP}
            onChange={setTwoP}
          />
        </div>
      </div>

      {/* Scenario Tabs */}
      <div className="tabs">
        {SCENARIOS.map((s, i) => (
          <button
            key={i}
            className={`tab-btn ${i === tab ? "active" : ""}`}
            onClick={() => setTab(i)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Scenario Card */}
      <div className="scenario-card">
        <h2>{scenario.title}</h2>
        <p className="scenario-desc">{scenario.desc}</p>

        <div className="comparison">
          {/* Kick XP option */}
          <div
            className={`option-card ${result.xp >= result.twoP ? "winner" : ""}`}
          >
            {result.xp >= result.twoP && <span className="badge">Better</span>}
            <h3>Kick Extra Point</h3>
            <div
              className={`win-prob ${result.xp >= result.twoP ? "green" : "blue"}`}
            >
              {pct(result.xp)}
            </div>
            <div className="formula">{scenario.xpFormula}</div>
          </div>

          {/* Go for 2 option */}
          <div
            className={`option-card ${result.twoP > result.xp ? "winner" : ""}`}
          >
            {result.twoP > result.xp && <span className="badge">Better</span>}
            <h3>Go for 2</h3>
            <div
              className={`win-prob ${result.twoP > result.xp ? "green" : "blue"}`}
            >
              {pct(result.twoP)}
            </div>
            <div className="formula">{scenario.twoPFormula}</div>
          </div>
        </div>

        {/* Edge */}
        <div className="edge">
          <div className="edge-label">Edge (Go for 2 − Kick XP)</div>
          <div
            className={`edge-value ${
              edge > 0.0001
                ? "positive"
                : edge < -0.0001
                  ? "negative"
                  : "neutral"
            }`}
          >
            {edge >= 0 ? "+" : ""}
            {pct(edge)}
          </div>
          <div className="edge-summary">
            {Math.abs(edge) < 0.0001
              ? "Effectively equal — either choice works."
              : edge > 0
                ? "Going for 2 gives a higher win probability."
                : "Kicking the extra point gives a higher win probability."}
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
