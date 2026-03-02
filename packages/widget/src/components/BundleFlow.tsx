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
const COLOR_TONES = ["Hele", "Tume", "Neutraalne", "Kontrast"];

const ROLE_LABEL: Record<RoomElement["role"], string> = {
  ankur: "Põhitoode",
  lisatoode: "Lisatoode",
  aksessuaar: "Aksessuaar"
};

const TOTAL_STEPS = 7;

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const inferElementSpecKey = (rawText: string): string | null => {
  const text = normalizeForMatch(rawText);
  if (!text) return null;
  if (text.includes("kirjutuslaud") || text.includes("toolaud") || text.includes("arvutilaud")) return "desk";
  if (text.includes("kontoritool")) return "office-chair";
  if (text.includes("soogilaud")) return "dining-table";
  if (text.includes("diivanilaud") || text.includes("kohvilaud") || text.includes("abilaud")) return "coffee-table";
  if (text.includes("diivan") || text.includes("sohva")) return "sofa";
  if (text.includes("tugitool")) return "armchair";
  if (text.includes("ookapp")) return "nightstand";
  if (text.includes("kummut") || text.includes("riietumislaud") || text.includes("puhvet")) return "dresser";
  if (text.includes("riidekapp")) return "wardrobe";
  if (text.includes("riiul")) return "shelf";
  if (text.includes("nagel") || text.includes("riidepuu")) return "hall-rack";
  if (text.includes("peegel")) return "mirror";
  if (text.includes("lamp") || text.includes("valgusti") || text.includes("pendel")) return "lamp";
  if (text.includes("vaip")) return "rug";
  if (text.includes("dekor") || text.includes("aksessuaar")) return "decor";
  if (text.includes("koogimoobel") || text.includes("kook")) return "kitchen-furniture";
  if (text.includes("pingike") || text.includes("pink") || text.includes("tumba")) return "bench";
  if (text.includes("voodi")) return "bed";
  if (text.includes("tool")) return "chair";
  return null;
};

const resolveAnchorElementForRoom = (room: string | undefined, anchorProduct: string | undefined): string | null => {
  if (!room || !anchorProduct || anchorProduct === "Bot vali ise") return null;
  const elements = ROOM_ELEMENTS[room] ?? [];
  if (!elements.length) return null;

  const anchorSpecKey = inferElementSpecKey(anchorProduct);
  if (anchorSpecKey) {
    const sameSpecElement = elements.find((el) => inferElementSpecKey(el.name) === anchorSpecKey);
    if (sameSpecElement) return sameSpecElement.name;
  }

  const normalizedAnchor = normalizeForMatch(anchorProduct);
  const byName = elements.find((el) => {
    const normalizedElement = normalizeForMatch(el.name);
    return normalizedElement.includes(normalizedAnchor) || normalizedAnchor.includes(normalizedElement);
  });

  return byName?.name ?? null;
};

export default function BundleFlow({ onComplete, onCancel }: BundleFlowProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<BundleAnswers>>({
    hasChildren: false,
    hasPets: false,
    dimensionsKnown: false
  });
  const [customBudget, setCustomBudget] = useState("");
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [elementPrefs, setElementPrefs] = useState<Record<string, string>>({});
  const lockedAnchorElement = resolveAnchorElementForRoom(answers.room, answers.anchorProduct);

  const set = <K extends keyof BundleAnswers>(key: K, value: BundleAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const selectRoom = (room: string) => {
    set("room", room);
    const elements = ROOM_ELEMENTS[room] ?? [];
    setSelectedElements(elements.map((e) => e.name));
    const prefs: Record<string, string> = {};
    for (const el of elements) {
      prefs[el.name] = "Pole vahet";
    }
    setElementPrefs(prefs);
  };

  const toggleElement = (name: string) => {
    setSelectedElements((prev) => {
      if (prev.includes(name)) {
        if (lockedAnchorElement === name) return prev;
        return prev.filter((e) => e !== name);
      }
      return [...prev, name];
    });
  };

  const selectAnchorProduct = (anchorProduct: string) => {
    set("anchorProduct", anchorProduct);
    const mappedAnchorElement = resolveAnchorElementForRoom(answers.room, anchorProduct);
    if (!mappedAnchorElement) return;

    setSelectedElements((prev) => {
      if (prev.includes(mappedAnchorElement)) return prev;
      const roomElements = ROOM_ELEMENTS[answers.room ?? ""] ?? [];
      const next = [...prev, mappedAnchorElement];
      return roomElements.length > 0 ? roomElements.map((el) => el.name).filter((name) => next.includes(name)) : next;
    });

    setElementPrefs((prev) => (mappedAnchorElement in prev ? prev : { ...prev, [mappedAnchorElement]: "Pole vahet" }));
  };

  const setElementPref = (element: string, value: string) => {
    setElementPrefs((prev) => ({
      ...prev,
      [element]: value
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
        style: elementPrefs[el] ?? "Pole vahet",
        material: "Pole vahet"
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
                  onClick={() => selectAnchorProduct(opt)}
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
            <div className="gl-flow-hint">Vajuta elemendile selle eemaldamiseks. Valitud põhitoode jääb alati sisse.</div>
            <div className="gl-flow-elements">
              {roomElements.map((el) => {
                const isSelected = selectedElements.includes(el.name);
                const isLocked = lockedAnchorElement === el.name && isSelected;
                return (
                  <button
                    key={el.name}
                    className={`gl-flow-element${isSelected ? " selected" : " removed"}${isLocked ? " locked" : ""}`}
                    onClick={() => toggleElement(el.name)}
                    disabled={isLocked}
                  >
                    <span className="gl-flow-element-name">{el.name}</span>
                    <span className={`gl-flow-element-role gl-role-${el.role}`}>
                      {ROLE_LABEL[el.role]}
                    </span>
                    <span className="gl-flow-element-toggle">{isLocked ? "🔒" : isSelected ? "✓" : "✕"}</span>
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
            <div className="gl-flow-question">Iga elemendi stiil</div>
            <div className="gl-flow-hint">Kui täpset stiili ei leidu, AI valib lähima saadaval variandi</div>
            <div className="gl-element-prefs">
              {selectedElements.map((el) => (
                <div key={el} className="gl-element-pref-row">
                  <div className="gl-element-pref-name">{el}</div>
                  <div className="gl-element-pref-selects">
                    <select
                      className="gl-element-pref-select"
                      value={elementPrefs[el] ?? "Pole vahet"}
                      onChange={(e) => setElementPref(el, e.target.value)}
                    >
                      {STYLES.map((s) => (
                        <option key={s} value={s}>{s}</option>
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
