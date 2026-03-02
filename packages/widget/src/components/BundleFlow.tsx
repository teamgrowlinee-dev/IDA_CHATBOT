import { useState } from "react";
import type { BundleAnswers, ElementPreference } from "../types.js";

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

interface RoomElement {
  name: string;
  role: "ankur" | "lisatoode" | "aksessuaar";
}

const ROOM_ELEMENTS: Record<string, RoomElement[]> = {
  "Elutuba": [
    { name: "Diivan", role: "ankur" },
    { name: "Kohvilaud", role: "lisatoode" },
    { name: "Tugitool", role: "lisatoode" },
    { name: "TV-alus / riiul", role: "lisatoode" },
    { name: "Lamp / valgusti", role: "aksessuaar" },
    { name: "Vaip", role: "aksessuaar" },
    { name: "Dekoratiivsed patjad", role: "aksessuaar" }
  ],
  "Magamistuba": [
    { name: "Voodi", role: "ankur" },
    { name: "Öökapp", role: "lisatoode" },
    { name: "Kummut / riietumislaud", role: "lisatoode" },
    { name: "Peegel", role: "aksessuaar" },
    { name: "Lamp / valgusti", role: "aksessuaar" },
    { name: "Vaip", role: "aksessuaar" }
  ],
  "Söögituba": [
    { name: "Söögilaud", role: "ankur" },
    { name: "Söögitoolid", role: "lisatoode" },
    { name: "Puhvet / serveerimislaud", role: "lisatoode" },
    { name: "Pendel / lamp", role: "aksessuaar" },
    { name: "Vaip", role: "aksessuaar" }
  ],
  "Köök": [
    { name: "Köögimööbel", role: "ankur" },
    { name: "Baaritool / taburet", role: "lisatoode" },
    { name: "Riiul / hoidik", role: "lisatoode" },
    { name: "Lamp / valgusti", role: "aksessuaar" }
  ],
  "Kontor": [
    { name: "Kirjutuslaud / töölaud", role: "ankur" },
    { name: "Kontoritool", role: "lisatoode" },
    { name: "Riiulikapp", role: "lisatoode" },
    { name: "Lamp", role: "aksessuaar" },
    { name: "Aksessuaarid / dekor", role: "aksessuaar" }
  ],
  "Lastetuba": [
    { name: "Lastemööbel / voodi", role: "ankur" },
    { name: "Laud / töölaud", role: "lisatoode" },
    { name: "Tool / istmik", role: "lisatoode" },
    { name: "Riiul / hoiukas", role: "lisatoode" },
    { name: "Lamp", role: "aksessuaar" },
    { name: "Vaip", role: "aksessuaar" }
  ],
  "Esik": [
    { name: "Riidekapp", role: "ankur" },
    { name: "Nagel / riidepuu", role: "lisatoode" },
    { name: "Jalatsiriiul", role: "lisatoode" },
    { name: "Peegel", role: "aksessuaar" },
    { name: "Pingike / tool", role: "lisatoode" }
  ]
};

const BUDGET_OPTIONS = [
  { label: "2000 – 4000 €", value: "2000-4000" },
  { label: "4000 – 7000 €", value: "4000-7000" },
  { label: "7000+ €", value: "7000+" },
  { label: "Täpne summa", value: "custom" }
];

const STYLES = ["Modern", "Skandinaavia", "Klassika", "Industriaal", "Boheem", "Luksus", "Pole vahet"];
const MATERIALS = ["Puit", "Metall", "Kangas", "Nahk", "Kunstnahk", "Pole vahet"];
const COLOR_TONES = ["Hele", "Tume", "Neutraalne", "Kontrast"];

const ROLE_LABEL: Record<RoomElement["role"], string> = {
  ankur: "Põhitoode",
  lisatoode: "Lisatoode",
  aksessuaar: "Aksessuaar"
};

const TOTAL_STEPS = 7;

export default function BundleFlow({ onComplete, onCancel }: BundleFlowProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<BundleAnswers>>({
    hasChildren: false,
    hasPets: false,
    dimensionsKnown: false
  });
  const [customBudget, setCustomBudget] = useState("");
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [elementPrefs, setElementPrefs] = useState<Record<string, { style: string; material: string }>>({});

  const set = <K extends keyof BundleAnswers>(key: K, value: BundleAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const selectRoom = (room: string) => {
    set("room", room);
    const elements = ROOM_ELEMENTS[room] ?? [];
    setSelectedElements(elements.map((e) => e.name));
    const prefs: Record<string, { style: string; material: string }> = {};
    for (const el of elements) {
      prefs[el.name] = { style: "Pole vahet", material: "Pole vahet" };
    }
    setElementPrefs(prefs);
  };

  const toggleElement = (name: string) => {
    setSelectedElements((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name]
    );
  };

  const setElementPref = (element: string, key: "style" | "material", value: string) => {
    setElementPrefs((prev) => ({
      ...prev,
      [element]: { ...(prev[element] ?? { style: "Pole vahet", material: "Pole vahet" }), [key]: value }
    }));
  };

  const canNext = () => {
    switch (step) {
      case 0: return !!answers.room;
      case 1: return !!answers.anchorProduct;
      case 2: return !!answers.budgetRange && (answers.budgetRange !== "custom" || customBudget !== "");
      case 3: return selectedElements.length > 0;
      case 4: return true;
      case 5: return !!answers.colorTone;
      case 6: return true;
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
      const elementPreferences: ElementPreference[] = selectedElements.map((el) => ({
        element: el,
        style: elementPrefs[el]?.style ?? "Pole vahet",
        material: elementPrefs[el]?.material ?? "Pole vahet"
      }));
      onComplete({
        ...(answers as BundleAnswers),
        selectedElements,
        elementPreferences
      });
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
                  onClick={() => selectRoom(room)}
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

      case 3: {
        const roomElements = ROOM_ELEMENTS[answers.room ?? ""] ?? [];
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Millised elemendid soovid komplekti?</div>
            <div className="gl-flow-hint">Vajuta elemendile selle eemaldamiseks</div>
            <div className="gl-flow-elements">
              {roomElements.map((el) => {
                const isSelected = selectedElements.includes(el.name);
                return (
                  <button
                    key={el.name}
                    className={`gl-flow-element${isSelected ? " selected" : " removed"}`}
                    onClick={() => toggleElement(el.name)}
                  >
                    <span className="gl-flow-element-name">{el.name}</span>
                    <span className={`gl-flow-element-role gl-role-${el.role}`}>
                      {ROLE_LABEL[el.role]}
                    </span>
                    <span className="gl-flow-element-toggle">{isSelected ? "✓" : "✕"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      case 4:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Iga elemendi stiil ja materjal</div>
            <div className="gl-flow-hint">"Pole vahet" lubab AI-l leida parima sobiva toote</div>
            <div className="gl-element-prefs">
              {selectedElements.map((el) => (
                <div key={el} className="gl-element-pref-row">
                  <div className="gl-element-pref-name">{el}</div>
                  <div className="gl-element-pref-selects">
                    <select
                      className="gl-element-pref-select"
                      value={elementPrefs[el]?.style ?? "Pole vahet"}
                      onChange={(e) => setElementPref(el, "style", e.target.value)}
                    >
                      {STYLES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      className="gl-element-pref-select"
                      value={elementPrefs[el]?.material ?? "Pole vahet"}
                      onChange={(e) => setElementPref(el, "material", e.target.value)}
                    >
                      {MATERIALS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Milline värvitoon sobib ruumile?</div>
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
            <div className="gl-flow-question" style={{ marginTop: 14 }}>Kas sul on lapsed?</div>
            <div className="gl-flow-options">
              <button
                className={`gl-flow-option${answers.hasChildren ? " selected" : ""}`}
                onClick={() => set("hasChildren", true)}
              >Jah</button>
              <button
                className={`gl-flow-option${!answers.hasChildren ? " selected" : ""}`}
                onClick={() => set("hasChildren", false)}
              >Ei</button>
            </div>
            <div className="gl-flow-question" style={{ marginTop: 14 }}>Kas sul on lemmikloomad?</div>
            <div className="gl-flow-options">
              <button
                className={`gl-flow-option${answers.hasPets ? " selected" : ""}`}
                onClick={() => set("hasPets", true)}
              >Jah</button>
              <button
                className={`gl-flow-option${!answers.hasPets ? " selected" : ""}`}
                onClick={() => set("hasPets", false)}
              >Ei</button>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Kas tead ruumi mõõtmeid?</div>
            <div className="gl-flow-options">
              <button
                className={`gl-flow-option${answers.dimensionsKnown ? " selected" : ""}`}
                onClick={() => set("dimensionsKnown", true)}
              >Jah</button>
              <button
                className={`gl-flow-option${!answers.dimensionsKnown ? " selected" : ""}`}
                onClick={() => set("dimensionsKnown", false)}
              >Ei</button>
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
