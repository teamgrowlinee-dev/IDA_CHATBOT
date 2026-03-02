import type { BundleAnswers, ProductCard } from "../types/chat.js";

// Room → WooCommerce category keywords mapping
export const ROOM_CATEGORIES: Record<string, string[]> = {
  "Elutuba": ["diivan", "tool", "laud", "riiul", "kapp", "kapid", "elutuba", "living"],
  "Magamistuba": ["voodi", "madrats", "öökapp", "kummut", "magamistuba", "bedroom"],
  "Söögituba": ["söögilaud", "söögitool", "söögituba", "diningroom", "dining"],
  "Köök": ["köögimööbel", "kook", "köök", "kitchen"],
  "Kontor": ["kirjutuslaud", "kirjutuslauad", "töölaud", "töölauad", "arvutilaud", "arvutilauad", "kontoritool", "riiul", "kontor", "office"],
  "Lastetuba": ["lastemööbel", "lastetuba", "laste", "kids", "children"],
  "Esik": ["esik", "riidekapp", "nagel", "hall", "hallway"]
};

// Role definitions per room
export const BUNDLE_ROLES: Record<string, Array<{ role: "ankur" | "lisatoode" | "aksessuaar"; keywords: string[]; required: boolean }>> = {
  "Elutuba": [
    { role: "ankur", keywords: ["diivan", "sohva"], required: true },
    { role: "lisatoode", keywords: ["tool", "tugitool", "laud", "kohvilaud"], required: true },
    { role: "aksessuaar", keywords: ["vaip", "lamp", "padi", "riiul"], required: false }
  ],
  "Magamistuba": [
    { role: "ankur", keywords: ["voodi", "voodiraam"], required: true },
    { role: "lisatoode", keywords: ["öökapp", "kummut"], required: true },
    { role: "aksessuaar", keywords: ["peegel", "lamp", "vaip"], required: false }
  ],
  "Söögituba": [
    { role: "ankur", keywords: ["söögilaud", "laud"], required: true },
    { role: "lisatoode", keywords: ["söögitool", "tool"], required: true },
    { role: "aksessuaar", keywords: ["lamp", "vaip", "puhvet"], required: false }
  ],
  "Köök": [
    { role: "ankur", keywords: ["köögimööbel", "kook"], required: true },
    { role: "lisatoode", keywords: ["baartool", "tool"], required: false },
    { role: "aksessuaar", keywords: ["lamp", "riiul"], required: false }
  ],
  "Kontor": [
    { role: "ankur", keywords: ["kirjutuslaud", "kirjutuslauad", "töölaud", "töölauad", "arvutilaud", "arvutilauad"], required: true },
    { role: "lisatoode", keywords: ["kontoritool", "kontoritoolid", "office chair"], required: true },
    { role: "aksessuaar", keywords: ["riiul", "lamp", "sahtlikapp"], required: false }
  ],
  "Lastetuba": [
    { role: "ankur", keywords: ["lastemööbel", "voodi", "laud"], required: true },
    { role: "lisatoode", keywords: ["tool", "riiul"], required: true },
    { role: "aksessuaar", keywords: ["lamp", "vaip"], required: false }
  ],
  "Esik": [
    { role: "ankur", keywords: ["riidekapp", "kapp"], required: true },
    { role: "lisatoode", keywords: ["nagel", "pingike"], required: false },
    { role: "aksessuaar", keywords: ["peegel", "vaip"], required: false }
  ]
};

// Anchor product options per room
export const ANCHOR_OPTIONS: Record<string, string[]> = {
  "Elutuba": ["Diivan", "Tugitool", "TV-kapp", "Bot vali ise"],
  "Magamistuba": ["Voodi", "Kummut", "Öökapp", "Bot vali ise"],
  "Söögituba": ["Söögilaud", "Söögitoolikomplekt", "Bot vali ise"],
  "Köök": ["Köögimööbel", "Baartool", "Bot vali ise"],
  "Kontor": ["Kirjutuslaud", "Kontoritool", "Riiulikapp", "Bot vali ise"],
  "Lastetuba": ["Lastemööbel komplekt", "Laste voodi", "Lastelaud", "Bot vali ise"],
  "Esik": ["Riidekapp", "Nagel", "Bot vali ise"]
};

// Style tag keywords for scoring
const STYLE_KEYWORDS: Record<string, string[]> = {
  "Modern": ["modern", "minimalist", "kaasaegne", "contemporary"],
  "Skandinaavia": ["skandinaavia", "scandi", "nordic", "põhjamaade"],
  "Klassika": ["klassika", "klassikaline", "classic", "traditional"],
  "Industriaal": ["industriaal", "industrial", "metall", "metal"],
  "Boheem": ["boheem", "boho", "natural", "naturaalne"],
  "Luksus": ["luksus", "premium", "velvet", "samet", "marble", "marmor"]
};

// Material conflict rules (for kids/pets safety)
const MATERIAL_CONFLICTS: Record<string, string[]> = {
  "kangas": ["hasPets", "hasChildren"],
  "nahk": ["hasPets"],
};

export function parseBudgetMax(answers: BundleAnswers): number {
  if (answers.budgetRange === "custom" && answers.budgetCustom) {
    return answers.budgetCustom;
  }
  const ranges: Record<string, number> = {
    "2000-4000": 4000,
    "4000-7000": 7000,
    "7000+": 20000
  };
  return ranges[answers.budgetRange] ?? 4000;
}

export function scoreCatalogProduct(product: ProductCard, answers: BundleAnswers): number {
  let score = 0;
  const titleLower = (product.title ?? "").toLowerCase();
  const categoryNames = (product.categoryNames ?? []).map(c => c.toLowerCase());
  const allText = [titleLower, ...categoryNames].join(" ");

  // Style match
  const styleKeywords = STYLE_KEYWORDS[answers.style ?? ""] ?? [];
  for (const kw of styleKeywords) {
    if (allText.includes(kw)) { score += 3; break; }
  }

  // Color tone match
  const colorMap: Record<string, string[]> = {
    "Hele": ["valge", "white", "beige", "hele", "light", "krem"],
    "Tume": ["must", "black", "tume", "dark", "hall", "grey"],
    "Neutraalne": ["hall", "beige", "neutraalne", "natural", "naturaalne"],
    "Kontrast": ["kontrast", "must", "valge", "black", "white"]
  };
  const colorKws = colorMap[answers.colorTone] ?? [];
  for (const kw of colorKws) {
    if (allText.includes(kw)) { score += 2; break; }
  }

  // Material preference match
  if ((answers.materialPreference ?? "Pole vahet") !== "Pole vahet") {
    const matLower = (answers.materialPreference ?? "").toLowerCase();
    if (allText.includes(matLower)) score += 2;

    // Material conflict (kids/pets)
    for (const [mat, conflictFlags] of Object.entries(MATERIAL_CONFLICTS)) {
      if (allText.includes(mat)) {
        for (const flag of conflictFlags) {
          if ((answers as unknown as Record<string, boolean>)[flag]) {
            score -= 3;
          }
        }
      }
    }
  }

  // Pet/child safety bonus for easy-clean materials
  if (answers.hasPets || answers.hasChildren) {
    if (allText.includes("kunstnahk") || allText.includes("mikrofiiber") || allText.includes("washable")) {
      score += 2;
    }
  }

  // Budget fit check
  const budgetMax = parseBudgetMax(answers);
  const price = parseFloat(product.price?.replace(/[^0-9.]/g, "") ?? "0");
  if (price > 0 && price <= budgetMax) score += 1;
  if (price > budgetMax * 1.15) score -= 2;

  return score;
}
