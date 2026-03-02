import { useState } from "react";
import type { BundleAnswers } from "../types.js";

interface BundleFlowProps {
  onComplete: (answers: BundleAnswers) => void;
  onCancel: () => void;
}

const ROOMS = ["Elutuba", "Magamistuba", "Söögituba", "Köök", "Kontor", "Lastetuba", "Esik"];

const ANCHOR_OPTIONS: Record<string, string[]> = {
  "Elutuba": ["Diivan", "Tugitool", "TV-kapp", "Bot vali ise"],
  "Magamistuba": ["Voodi", "Kummut", "Öökapp", "Bot vali ise"],
  "Söögituba": ["Söögilaud", "Söögitoolikomplekt", "Bot vali ise"],
  "Köök": ["Köögimööbel", "Baartool", "Bot vali ise"],
  "Kontor": ["Kirjutuslaud", "Kontoritool", "Riiulikapp", "Bot vali ise"],
  "Lastetuba": ["Lastemööbel komplekt", "Laste voodi", "Lastelaud", "Bot vali ise"],
  "Esik": ["Riidekapp", "Nagel", "Bot vali ise"]
};

const BUDGET_OPTIONS = [
  { label: "800 – 1500 €", value: "800-1500" },
  { label: "1500 – 3000 €", value: "1500-3000" },
  { label: "3000 – 6000 €", value: "3000-6000" },
  { label: "6000+ €", value: "6000+" },
  { label: "Täpne summa", value: "custom" }
];

const STYLES = ["Modern", "Skandinaavia", "Klassika", "Industriaal", "Boheem", "Luksus"];
const COLOR_TONES = ["Hele", "Tume", "Neutraalne", "Kontrast"];
const MATERIALS = ["Puit", "Metall", "Kangas", "Nahk", "Kunstnahk", "Pole vahet"];

const TOTAL_STEPS = 6;

export default function BundleFlow({ onComplete, onCancel }: BundleFlowProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<BundleAnswers>>({
    hasChildren: false,
    hasPets: false,
    dimensionsKnown: false,
    materialPreference: "Pole vahet"
  });
  const [customBudget, setCustomBudget] = useState("");

  const set = <K extends keyof BundleAnswers>(key: K, value: BundleAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const canNext = () => {
    switch (step) {
      case 0: return !!answers.room;
      case 1: return !!answers.anchorProduct;
      case 2: return !!answers.budgetRange && (answers.budgetRange !== "custom" || customBudget !== "");
      case 3: return !!answers.style && !!answers.colorTone;
      case 4: return !!answers.materialPreference;
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      if (step === 2 && answers.budgetRange === "custom") {
        set("budgetCustom", Number(customBudget));
      }
      setStep((s) => s + 1);
    } else {
      // Final step — complete
      onComplete(answers as BundleAnswers);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Millist ruumi soovid sisustada?</div>
            <div className="gl-flow-options">
              {ROOMS.map((room) => (
                <button
                  key={room}
                  className={`gl-flow-option${answers.room === room ? " selected" : ""}`}
                  onClick={() => set("room", room)}
                >
                  {room}
                </button>
              ))}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Mis on komplekti tähtsamaim toode?</div>
            <div className="gl-flow-options">
              {(ANCHOR_OPTIONS[answers.room ?? ""] ?? ["Bot vali ise"]).map((opt) => (
                <button
                  key={opt}
                  className={`gl-flow-option${answers.anchorProduct === opt ? " selected" : ""}`}
                  onClick={() => set("anchorProduct", opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Milline on sinu eelarve kogu komplektile?</div>
            <div className="gl-flow-options">
              {BUDGET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`gl-flow-option${answers.budgetRange === opt.value ? " selected" : ""}`}
                  onClick={() => set("budgetRange", opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {answers.budgetRange === "custom" && (
              <input
                type="number"
                className="gl-flow-input"
                placeholder="Sisesta summa (€)"
                value={customBudget}
                onChange={(e) => setCustomBudget(e.target.value)}
                min={100}
              />
            )}
          </div>
        );

      case 3:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Milline on sinu stiilieelistus?</div>
            <div className="gl-flow-options">
              {STYLES.map((s) => (
                <button
                  key={s}
                  className={`gl-flow-option${answers.style === s ? " selected" : ""}`}
                  onClick={() => set("style", s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="gl-flow-question" style={{ marginTop: 14 }}>Milline värvitoon sobib?</div>
            <div className="gl-flow-options">
              {COLOR_TONES.map((c) => (
                <button
                  key={c}
                  className={`gl-flow-option${answers.colorTone === c ? " selected" : ""}`}
                  onClick={() => set("colorTone", c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Kas sul on lapsed?</div>
            <div className="gl-flow-options">
              <button
                className={`gl-flow-option${answers.hasChildren ? " selected" : ""}`}
                onClick={() => set("hasChildren", true)}
              >
                Jah
              </button>
              <button
                className={`gl-flow-option${!answers.hasChildren ? " selected" : ""}`}
                onClick={() => set("hasChildren", false)}
              >
                Ei
              </button>
            </div>
            <div className="gl-flow-question" style={{ marginTop: 14 }}>Kas sul on lemmikloomad?</div>
            <div className="gl-flow-options">
              <button
                className={`gl-flow-option${answers.hasPets ? " selected" : ""}`}
                onClick={() => set("hasPets", true)}
              >
                Jah
              </button>
              <button
                className={`gl-flow-option${!answers.hasPets ? " selected" : ""}`}
                onClick={() => set("hasPets", false)}
              >
                Ei
              </button>
            </div>
            <div className="gl-flow-question" style={{ marginTop: 14 }}>Eelistatud materjal?</div>
            <div className="gl-flow-options">
              {MATERIALS.map((m) => (
                <button
                  key={m}
                  className={`gl-flow-option${answers.materialPreference === m ? " selected" : ""}`}
                  onClick={() => set("materialPreference", m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Kas tead ruumi mõõtmeid?</div>
            <div className="gl-flow-options">
              <button
                className={`gl-flow-option${answers.dimensionsKnown ? " selected" : ""}`}
                onClick={() => set("dimensionsKnown", true)}
              >
                Jah
              </button>
              <button
                className={`gl-flow-option${!answers.dimensionsKnown ? " selected" : ""}`}
                onClick={() => set("dimensionsKnown", false)}
              >
                Ei
              </button>
            </div>
            {answers.dimensionsKnown && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexDirection: "column" }}>
                <input
                  type="number"
                  className="gl-flow-input"
                  placeholder="Laius (cm)"
                  value={answers.widthCm ?? ""}
                  onChange={(e) => set("widthCm", Number(e.target.value))}
                  min={50}
                />
                <input
                  type="number"
                  className="gl-flow-input"
                  placeholder="Pikkus (cm)"
                  value={answers.lengthCm ?? ""}
                  onChange={(e) => set("lengthCm", Number(e.target.value))}
                  min={50}
                />
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="gl-flow-wrap">
      <div className="gl-stepper">Samm {step + 1}/{TOTAL_STEPS}</div>
      {renderStep()}
      <div className="gl-flow-nav">
        {step > 0 ? (
          <button className="gl-flow-back" onClick={() => setStep((s) => s - 1)}>
            ← Tagasi
          </button>
        ) : (
          <button className="gl-flow-cancel" onClick={onCancel}>
            Tühista
          </button>
        )}
        <button className="gl-flow-next" onClick={handleNext} disabled={!canNext()}>
          {step === TOTAL_STEPS - 1 ? "Genereeri komplektid" : "Edasi →"}
        </button>
      </div>
    </div>
  );
}
