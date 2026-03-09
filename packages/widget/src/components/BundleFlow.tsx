import { useEffect, useState } from "react";
import type { BundleAnswers, ElementPreference } from "../types.js";

interface BundleFlowProps {
  apiBase: string;
  onComplete: (answers: BundleAnswers) => void;
  onCancel: () => void;
}

const ROOMS = ["Elutuba", "Magamistuba", "Söögituba", "Köök", "Kontor", "Lastetuba", "Esik"];

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
  { label: "2000 – 7000 €", value: "2000-7000", min: 2000, max: 7000 },
  { label: "7000 – 12000 €", value: "7000-12000", min: 7000, max: 12000 },
  { label: "12000 – 25000 €", value: "12000+", min: 12000, max: 25000 }
];

const STYLE_PLACEHOLDER = "Vali";
const formatMetric = (value: number) => value.toFixed(2).replace(".", ",");

const ROLE_LABEL: Record<RoomElement["role"], string> = {
  ankur: "Põhitoode",
  lisatoode: "Lisatoode",
  aksessuaar: "Aksessuaar"
};

const TOTAL_STEPS = 5;

type StyleOptionsByElement = Record<string, string[]>;

export default function BundleFlow({ apiBase, onComplete, onCancel }: BundleFlowProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<BundleAnswers>>({
    anchorProduct: "Bot vali ise",
    colorTone: "Neutraalne",
    hasChildren: false,
    hasPets: false,
    dimensionsKnown: false
  });
  const [customBudget, setCustomBudget] = useState("");
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [elementPrefs, setElementPrefs] = useState<Record<string, string>>({});
  const [styleOptionsByElement, setStyleOptionsByElement] = useState<StyleOptionsByElement>({});
  const [styleOptionsLoading, setStyleOptionsLoading] = useState(false);
  const [styleOptionsError, setStyleOptionsError] = useState<string | null>(null);

  const set = <K extends keyof BundleAnswers>(key: K, value: BundleAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const selectRoom = (room: string) => {
    const elements = ROOM_ELEMENTS[room] ?? [];
    setAnswers((prev) => ({
      ...prev,
      room,
      anchorProduct: "Bot vali ise"
    }));
    setSelectedElements(elements.map((e) => e.name));
    const prefs: Record<string, string> = {};
    for (const el of elements) {
      prefs[el.name] = STYLE_PLACEHOLDER;
    }
    setElementPrefs(prefs);
  };

  const toggleElement = (name: string) => {
    setSelectedElements((prev) => {
      if (prev.includes(name)) {
        return prev.filter((e) => e !== name);
      }
      return [...prev, name];
    });
  };

  const setElementPref = (element: string, value: string) => {
    setElementPrefs((prev) => ({
      ...prev,
      [element]: value
    }));
  };

  useEffect(() => {
    const room = answers.room;
    if (!room || selectedElements.length === 0) {
      setStyleOptionsByElement({});
      setStyleOptionsError(null);
      setStyleOptionsLoading(false);
      return;
    }

    let cancelled = false;

    const loadStyleOptions = async () => {
      setStyleOptionsLoading(true);
      setStyleOptionsError(null);
      try {
        const res = await fetch(`${apiBase}/api/bundle/options`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room,
            selectedElements,
            anchorProduct: answers.anchorProduct ?? ""
          })
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`;
          throw new Error(msg);
        }

        const raw = payload?.styleOptionsByElement as unknown;
        const normalized: StyleOptionsByElement = {};
        for (const el of selectedElements) {
          const list =
            raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>)[el])
              ? ((raw as Record<string, unknown>)[el] as unknown[])
                  .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                  .filter((value) => value !== "Pole vahet" && value !== STYLE_PLACEHOLDER)
              : [];
          normalized[el] = list;
        }

        if (cancelled) return;
        setStyleOptionsByElement(normalized);
        setElementPrefs((prev) => {
          const next = { ...prev };
          for (const el of selectedElements) {
            const options = normalized[el] ?? [];
            if (!options.includes(next[el] ?? "")) {
              next[el] = STYLE_PLACEHOLDER;
            }
          }
          return next;
        });
      } catch (error) {
        if (cancelled) return;
        setStyleOptionsError(error instanceof Error ? error.message : "Stiilide laadimine ebaõnnestus");
      } finally {
        if (!cancelled) {
          setStyleOptionsLoading(false);
        }
      }
    };

    void loadStyleOptions();

    return () => {
      cancelled = true;
    };
  }, [answers.anchorProduct, answers.room, apiBase, selectedElements]);

  const selectedBudget = BUDGET_OPTIONS.find((opt) => opt.value === answers.budgetRange) ?? null;
  const budgetInput = customBudget.trim();
  const parsedCustomBudget = budgetInput.length > 0 ? Number(budgetInput) : null;
  const customBudgetValid =
    !selectedBudget ||
    budgetInput.length === 0 ||
    (Number.isFinite(parsedCustomBudget) &&
      parsedCustomBudget >= selectedBudget.min &&
      parsedCustomBudget <= selectedBudget.max);
  const widthCm =
    Number.isFinite(answers.widthCm) && Number(answers.widthCm) > 0 ? Number(answers.widthCm) : null;
  const lengthCm =
    Number.isFinite(answers.lengthCm) && Number(answers.lengthCm) > 0 ? Number(answers.lengthCm) : null;
  const heightCm =
    Number.isFinite(answers.heightCm) && Number(answers.heightCm) > 0 ? Number(answers.heightCm) : null;
  const roomAreaM2 = widthCm !== null && lengthCm !== null ? (widthCm * lengthCm) / 10000 : null;
  const roomVolumeM3 = roomAreaM2 !== null && heightCm !== null ? (roomAreaM2 * heightCm) / 100 : null;
  const dimensionsComplete = !answers.dimensionsKnown || (widthCm !== null && lengthCm !== null && heightCm !== null);

  const canNext = () => {
    switch (step) {
      case 0:
        return !!answers.room;
      case 1:
        return !!answers.budgetRange && customBudgetValid;
      case 2:
        return selectedElements.length > 0;
      case 3:
        return true;
      case 4:
        return dimensionsComplete;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      if (step === 1) {
        setAnswers((prev) => ({
          ...prev,
          budgetCustom:
            budgetInput.length > 0 && Number.isFinite(parsedCustomBudget)
              ? Math.round(parsedCustomBudget as number)
              : undefined
        }));
      }
      setStep((s) => s + 1);
      return;
    }

    const elementPreferences: ElementPreference[] = selectedElements.map((el) => ({
      element: el,
      style:
        elementPrefs[el] && elementPrefs[el] !== STYLE_PLACEHOLDER
          ? elementPrefs[el]
          : "Pole vahet",
      material: "Pole vahet"
    }));

    onComplete({
      ...(answers as BundleAnswers),
      anchorProduct: answers.anchorProduct ?? "Bot vali ise",
      selectedElements,
      elementPreferences,
      roomAreaM2: roomAreaM2 ?? undefined,
      roomVolumeM3: roomVolumeM3 ?? undefined
    });
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

            {selectedBudget && (
              <>
                <div className="gl-flow-hint" style={{ marginTop: 10 }}>
                  Täpne summa (valikuline). Lubatud selles vahemikus: {selectedBudget.min}–{selectedBudget.max}€.
                </div>
                <input
                  type="number"
                  className="gl-flow-input"
                  placeholder="Nt 3568"
                  value={customBudget}
                  onChange={(e) => setCustomBudget(e.target.value)}
                  min={selectedBudget.min}
                  max={selectedBudget.max}
                />
                {!customBudgetValid && (
                  <div className="gl-flow-hint" style={{ color: "#ffb3b3", marginTop: 8 }}>
                    Täpne summa peab jääma vahemikku {selectedBudget.min}–{selectedBudget.max}€.
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 2: {
        const roomElements = ROOM_ELEMENTS[answers.room ?? ""] ?? [];
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Millised elemendid soovid komplekti?</div>
            <div className="gl-flow-hint">Vajuta elemendile selle eemaldamiseks või lisamiseks.</div>
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
                    <span className={`gl-flow-element-role gl-role-${el.role}`}>{ROLE_LABEL[el.role]}</span>
                    <span className="gl-flow-element-toggle">{isSelected ? "✓" : "✕"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      case 3:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Iga elemendi stiil</div>
            <div className="gl-flow-hint">Näitan ainult neid stiile, mis on sellele elemendile kataloogis saadaval.</div>
            {styleOptionsLoading && <div className="gl-flow-hint">Laen stiilivalikuid...</div>}
            {styleOptionsError && (
              <div className="gl-flow-hint" style={{ color: "#ffb3b3" }}>
                {styleOptionsError}
              </div>
            )}
            <div className="gl-element-prefs">
              {selectedElements.map((el) => {
                const styles = styleOptionsByElement[el] ?? [];
                return (
                  <div key={el} className="gl-element-pref-row">
                    <div className="gl-element-pref-name">{el}</div>
                    <div className="gl-element-pref-selects">
                      <select
                        className="gl-element-pref-select"
                        value={elementPrefs[el] ?? STYLE_PLACEHOLDER}
                        onChange={(e) => setElementPref(el, e.target.value)}
                      >
                        <option value={STYLE_PLACEHOLDER}>{STYLE_PLACEHOLDER}</option>
                        {styles
                          .filter((s) => s !== STYLE_PLACEHOLDER)
                          .map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="gl-flow-step">
            <div className="gl-flow-question">Kas tead ruumi mõõtmeid (X / Y / Z)?</div>
            <div className="gl-flow-options">
              <button
                className={`gl-flow-option${answers.dimensionsKnown ? " selected" : ""}`}
                onClick={() => set("dimensionsKnown", true)}
              >
                Jah
              </button>
              <button
                className={`gl-flow-option${!answers.dimensionsKnown ? " selected" : ""}`}
                onClick={() =>
                  setAnswers((prev) => ({
                    ...prev,
                    dimensionsKnown: false,
                    widthCm: undefined,
                    lengthCm: undefined,
                    heightCm: undefined,
                    roomAreaM2: undefined,
                    roomVolumeM3: undefined
                  }))
                }
              >
                Ei
              </button>
            </div>
            {answers.dimensionsKnown && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexDirection: "column" }}>
                <div className="gl-flow-hint">Sisesta toa laius (X), pikkus (Y) ja kõrgus (Z) sentimeetrites.</div>
                <input
                  type="number"
                  className="gl-flow-input"
                  placeholder="Toa laius X (cm)"
                  value={answers.widthCm ?? ""}
                  onChange={(e) => set("widthCm", e.target.value ? Number(e.target.value) : undefined)}
                  min={50}
                />
                <input
                  type="number"
                  className="gl-flow-input"
                  placeholder="Toa pikkus Y (cm)"
                  value={answers.lengthCm ?? ""}
                  onChange={(e) => set("lengthCm", e.target.value ? Number(e.target.value) : undefined)}
                  min={50}
                />
                <input
                  type="number"
                  className="gl-flow-input"
                  placeholder="Toa kõrgus Z (cm)"
                  value={answers.heightCm ?? ""}
                  onChange={(e) => set("heightCm", e.target.value ? Number(e.target.value) : undefined)}
                  min={50}
                />
                <div className="gl-flow-hint" style={{ marginTop: 4 }}>
                  {roomAreaM2 !== null
                    ? `Ruumi pindala: ${formatMetric(roomAreaM2)} m²`
                    : "Ruumi pindala: sisesta laius ja pikkus"}
                </div>
                <div className="gl-flow-hint" style={{ marginTop: -6 }}>
                  {roomVolumeM3 !== null
                    ? `Ruumi maht: ${formatMetric(roomVolumeM3)} m³`
                    : "Ruumi maht: sisesta laius, pikkus ja kõrgus"}
                </div>
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
