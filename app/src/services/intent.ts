import type { ChatIntent } from "../types/chat.js";

export interface ParsedConstraints {
  budgetMax?: number;
  vegan?: boolean;
  goal?: "style" | "function" | "outdoor";
  productTypes: string[];
  tags: string[];
}

const budgetWithKeywordRegex =
  /(?:eel\s*arve|eelarve|budget|hinnapiir|hinnaga|hind)\s*(?:on|=|:|kuni|alla|under|max|<=?)?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur|euro|eurot)?\b/i;
const budgetWithCurrencyRegex =
  /(?:kuni|alla|under|max|<=?)\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur|euro|eurot)\b/i;
const dimensionUnitRegex = /\b(?:cm|m|meetri|meetrit|meeter)\b/i;
const greetingOnlyRegex = /^\s*(tere|tervist|tsau|hei|hello|hey)\s*[!,.?]*\s*$/i;
const acknowledgmentRegex =
  /^\s*(okei|ok|okay|selge|sain aru|mhm|jaa?h?|ei|t[aä]nan|ait[aä]h|super|lahe|vahva|kena|tore|h[aä][aä]sti|n[aä]gemist|head aega|davai|n[oõ]us|j[aä]rjest)\s*[!,.?]*\s*$/i;

// Customer-service stems
const shippingRe = /tarne|shipping|kohale|kohaletoimet|kuller|pakiautomaat|omniva|smartpost|itella|tarneaeg|laos|j[aä]reltellit/;
const returnsRe = /tagast|refund|return|raha tagasi|taganemis|pretensioon|reklamatsioon|defekt|katki|kahjust/;
const faqRe = /kontakt|telefon|email|e-post|klienditugi|support|garantii|privaatsus|isikuandmed|andmekaitse|tingimused|m[uü][uü]gitingimused/;
const orderHelpRe = /tellimus|order|tracking|makse|makstud|maksmine|kassa|arve|status|saadetis/;

// Product-interest stems for interior store
const productRecoRe =
  /soovita|soovitus|otsi|otsin|soovin|vajan|milline|diivan|tugitool|tool|laud|s[öo]ögilaud|diivanilaud|voodi|riiul|kapp|kummut|valgust|lamp|vaip|peegel|aiam[öo][öo]bel|terrass|nordic|skandinaav|sisustus|mööbel|moobel|eelarve|kuni\s*\d|under\s*\d|<=?\s*\d/;

const extractBudgetMax = (text: string): number | undefined => {
  const keywordMatch = text.match(budgetWithKeywordRegex);
  if (keywordMatch?.[1]) {
    const parsed = Number(keywordMatch[1].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const currencyMatch = text.match(budgetWithCurrencyRegex);
  if (currencyMatch?.[1]) {
    const unitTail = text.slice(currencyMatch.index ?? 0, (currencyMatch.index ?? 0) + currencyMatch[0].length + 10);
    if (dimensionUnitRegex.test(unitTail)) {
      return undefined;
    }
    const parsed = Number(currencyMatch[1].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return undefined;
};

export const detectIntent = (input: string): ChatIntent => {
  const text = input.toLowerCase();

  if (acknowledgmentRegex.test(input)) return "smalltalk";
  if (extractBudgetMax(text) !== undefined) return "product_reco";

  const hasOrder = orderHelpRe.test(text);
  const hasShipping = shippingRe.test(text);
  const hasReturns = returnsRe.test(text);
  const hasFaq = faqRe.test(text);
  const hasProduct = productRecoRe.test(text);

  if (hasOrder) return "order_help";
  if (hasShipping) return "shipping";
  if (hasReturns) return "returns";
  if (hasFaq) return "faq";
  if (hasProduct) return "product_reco";

  if (/toode|tooted|toote|mööbel|moobel|sisustus/.test(text)) return "product_reco";
  if (greetingOnlyRegex.test(input)) return "greeting";

  return "smalltalk";
};

export const parseConstraints = (input: string): ParsedConstraints => {
  const text = input.toLowerCase();
  const budgetMax = extractBudgetMax(text);

  const goal = /välis|outdoor|terrass|aed|rõdu|rodu/.test(text)
    ? "outdoor"
    : /stiil|disain|värv|varv|nordic|skandinaav/.test(text)
      ? "style"
      : /praktiline|mahut|funktsioon|hoiusta|ladusta/.test(text)
        ? "function"
        : undefined;

  const productTypes: string[] = [];
  if (/öö\s*kapp|oo\s*kapp|ookapp|nightstand/.test(text)) productTypes.push("öökapp");
  if (/tv\s*kapp|tvkapp/.test(text)) productTypes.push("tv-kapp");
  if (/vitriinkapp/.test(text)) productTypes.push("vitriinkapp");
  if (/kummut/.test(text)) productTypes.push("kummut");
  if (/riiul|raamaturiiul|seinariiul/.test(text)) productTypes.push("riiul");

  if (/diivan|nurgadiivan|mooduldiivan/.test(text)) productTypes.push("diivan");
  if (/tugitool|tool|söögitool|soogitool|baaritool/.test(text)) productTypes.push("tool");
  if (/laud|söögilaud|soogilaud|diivanilaud|abilaud|kirjutuslaud/.test(text)) productTypes.push("laud");
  if (/voodi|madrats/.test(text)) productTypes.push("voodi");
  if (
    /kapp/.test(text) &&
    !/öö\s*kapp|oo\s*kapp|ookapp|nightstand|tv\s*kapp|tvkapp|vitriinkapp|kummut/.test(text)
  ) {
    productTypes.push("kapp");
  }
  if (/valgust|lamp|laevalgusti|lauavalgusti|põrandavalgusti|porandavalgusti/.test(text)) {
    productTypes.push("valgusti");
  }
  if (/vaip/.test(text)) productTypes.push("vaip");
  if (/peegel/.test(text)) productTypes.push("peegel");
  if (/terrass|aed|õuemööbel|ouemoobel|aiamööbel|aiamoobel/.test(text)) productTypes.push("aiamööbel");

  const tags: string[] = [];
  if (goal === "style") tags.push("goal_style");
  if (goal === "function") tags.push("goal_function");
  if (goal === "outdoor") tags.push("goal_outdoor");

  return {
    budgetMax,
    vegan: false,
    goal,
    productTypes: [...new Set(productTypes)],
    tags
  };
};
