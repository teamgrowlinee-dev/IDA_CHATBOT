import { commerceConfig } from "../config/policies.js";
import { env } from "../config/env.js";
import type { ChatResponse } from "../types/chat.js";
import { detectIntent, parseConstraints } from "./intent.js";
import {
  add_to_cart,
  answer_faq,
  type CategoryClarificationOption,
  type CategoryClarificationPlan,
  computeCommerceActions,
  create_cart,
  get_cart,
  handoff,
  planCategoryClarification,
  recommend_products,
} from "./storefront-tools.js";
import {
  classifyIntentWithContext,
  generateGeneralChatReply,
  generateProductSetSummary,
  generateShortReply
} from "./llm.js";

export interface ChatInput {
  message: string;
  cartId?: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
}

const chips = ["Tarne info", "Tagastamine", "Tingimused", "Makse ja tarne", "Kontakt"];

interface PendingCategoryClarification {
  baseQuery: string;
  plan: CategoryClarificationPlan;
}

const CATEGORY_CLARIFY_MARKER = "tapsusta palun kategooria";

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatNaturalList = (values: string[]): string => {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} või ${values[values.length - 1]}`;
};

const tokenMatch = (left: string, right: string): boolean => {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 6 && right.length >= 6 && (left.includes(right) || right.includes(left))) return true;
  const leftTrimmed = left.replace(/[sd]$/, "");
  const rightTrimmed = right.replace(/[sd]$/, "");
  if (leftTrimmed === rightTrimmed) return true;
  if (leftTrimmed.length >= 6 && rightTrimmed.length >= 6) {
    return leftTrimmed.includes(rightTrimmed) || rightTrimmed.includes(leftTrimmed);
  }
  return false;
};

const optionMatchesMessage = (message: string, option: CategoryClarificationOption): boolean => {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) return false;

  const messageTokens = normalizedMessage.split(" ").filter((token) => token.length > 2);
  const optionTokens = [option.label, ...option.keywords]
    .map((value) => normalizeText(value))
    .flatMap((value) => value.split(" "))
    .filter((token) => token.length > 2);

  return optionTokens.some((optionToken) => {
    if (normalizedMessage.includes(optionToken) || optionToken.includes(normalizedMessage)) return true;
    return messageTokens.some((messageToken) => tokenMatch(messageToken, optionToken));
  });
};

const hasSpecificSubcategoryMention = (message: string, options: CategoryClarificationOption[]): boolean =>
  options.some((option) => optionMatchesMessage(message, option));

const findPendingCategoryClarification = async (
  history: Array<{ role: "user" | "assistant"; text: string }>
): Promise<PendingCategoryClarification | null> => {
  const lastAssistantIndex = [...history]
    .map((entry, index) => ({ entry, index }))
    .reverse()
    .find(({ entry }) => entry.role === "assistant")?.index;

  if (lastAssistantIndex === undefined) return null;

  const assistantMessage = history[lastAssistantIndex];
  const normalizedAssistant = normalizeText(assistantMessage.text);
  if (!normalizedAssistant.includes(CATEGORY_CLARIFY_MARKER)) return null;

  const baseUserMessage = [...history.slice(0, lastAssistantIndex)].reverse().find((item) => item.role === "user");
  if (!baseUserMessage?.text) return null;

  const baseConstraints = parseConstraints(baseUserMessage.text);
  const plan = await planCategoryClarification({
    query: baseUserMessage.text,
    productTypes: baseConstraints.productTypes
  });
  if (!plan) return null;

  return {
    baseQuery: baseUserMessage.text,
    plan
  };
};

const resolveCategoryClarificationReply = (
  message: string,
  options: CategoryClarificationOption[]
): CategoryClarificationOption | null => options.find((option) => optionMatchesMessage(message, option)) ?? null;

export const runChat = async (input: ChatInput): Promise<ChatResponse> => {
  if (input.message.trim().toLowerCase() === "/debug") {
    return {
      message: `debug: useOpenAI=${env.USE_OPENAI} hasKey=${Boolean(env.OPENAI_API_KEY)} model=${env.OPENAI_MODEL}`,
      cards: [],
      suggestions: chips,
      actions: {}
    };
  }

  const history = input.history ?? [];
  let intent = detectIntent(input.message);
  if (env.USE_OPENAI && env.OPENAI_API_KEY) {
    const refined = await classifyIntentWithContext({
      userMessage: input.message,
      history
    });
    if (refined?.intent) intent = refined.intent;
  }

  let effectiveQuery = input.message;
  let constraints = parseConstraints(effectiveQuery);
  const pendingCategoryClarification = await findPendingCategoryClarification(history);
  const selectedCategoryOption = pendingCategoryClarification
    ? resolveCategoryClarificationReply(input.message, pendingCategoryClarification.plan.options)
    : null;

  if (pendingCategoryClarification && selectedCategoryOption) {
    effectiveQuery = `${pendingCategoryClarification.baseQuery} ${selectedCategoryOption.queryToken}`;
    constraints = parseConstraints(effectiveQuery);
    intent = "product_reco";
  }

  if (/pahane|vihane|petetud|fraud|chargeback|kadunud pakk|makse probleem/.test(input.message.toLowerCase())) {
    const escalation = await handoff({
      summary: `Klient vajab kiiret tuge: ${input.message}`
    });
    return {
      message: `Võtan selle kohe klienditoele edasi. ${escalation.nextStep}`,
      cards: [],
      suggestions: ["Jäta oma e-mail", "Kirjelda tellimuse number", "Soovin kõnet"],
      actions: {}
    };
  }

  if (intent === "shipping" || intent === "returns" || intent === "faq") {
    const faq = await answer_faq({ question: input.message });
    const text = await generateShortReply({
      userText: input.message,
      contextSummary: faq.answer,
      fallback: `${faq.answer} Vaata ka: ${faq.recommendedLink ?? faq.links.contact}`
    });

    return {
      message: text,
      cards: [],
      suggestions: chips,
      actions: {}
    };
  }

  if (intent === "greeting") {
    return {
      message:
        "Tere! Olen IDA Sisustuspood assistent. Aitan tarne, tagastuse, tingimuste ja kontakti küsimustega ning leian sulle sobivaid tooteid.",
      cards: [],
      suggestions: chips,
      actions: {}
    };
  }

  if (intent === "order_help") {
    const text = await generateGeneralChatReply({
      userText: input.message,
      fallback:
        "Aitan hea meelega. Kui küsimus on tellimuse või makse kohta, kirjuta palun tellimuse number ja kontakt või kirjuta otse: info@idastuudio.ee."
    });

    return {
      message: text,
      cards: [],
      suggestions: chips,
      actions: {}
    };
  }

  if (intent === "smalltalk") {
    const text = await generateGeneralChatReply({
      userText: input.message,
      fallback:
        "Selge! Kas soovid abi tarne/tagastuse küsimuses või otsid mõnda toodet? Tootesoovituseks kirjelda palun stiili, toote tüüpi ja eelarvet."
    });

    return { message: text, cards: [], suggestions: chips, actions: {} };
  }

  if (
    intent === "product_reco" &&
    !selectedCategoryOption
  ) {
    const categoryPlan = await planCategoryClarification({
      query: effectiveQuery,
      productTypes: constraints.productTypes
    });

    if (categoryPlan && !hasSpecificSubcategoryMention(effectiveQuery, categoryPlan.options)) {
      const optionLabels = categoryPlan.options.map((option) => option.label);
      return {
        message: `Et leiaksin täpsema vaste, täpsusta palun kategooria (${categoryPlan.mainCategoryLabel}): ${formatNaturalList(
          optionLabels.map((label) => label.toLowerCase())
        )}.`,
        cards: [],
        suggestions: optionLabels.slice(0, 10),
        actions: {}
      };
    }
  }

  const cards = await recommend_products({
    intent,
    constraints: {
      ...constraints,
      query: effectiveQuery
    },
    limit: 4
  });

  let cartId = input.cartId ?? "";
  if (!cartId) {
    const cart = await create_cart();
    cartId = cart.cartId;
  }

  const cart = cartId ? await get_cart({ cartId }) : null;
  const subtotal = Number(cart?.cost?.subtotalAmount?.amount ?? 0);
  const actions = computeCommerceActions(subtotal);

  let message: string;
  let productSummary: string | undefined;

  if (cards.length > 0) {
    message = "Siin on minu soovitused just sulle:";
    const summary = await generateProductSetSummary({
      userMessage: effectiveQuery,
      products: cards.map((c) => ({ title: c.title, reason: c.reason }))
    });
    if (summary) productSummary = summary;
  } else {
    message = "Kahjuks ei leidnud praegu sobivaid tooteid. Proovi palun kirjeldada täpsemalt (nt toote tüüp, stiil ja eelarve).";
  }

  return {
    message,
    cards,
    suggestions: chips,
    actions,
    cartId,
    ...(productSummary ? { productSummary } : {})
  };
};

export const addCartLineFromChat = async (input: {
  cartId?: string;
  variantId: string;
  quantity?: number;
}) => {
  let cartId = input.cartId ?? "";
  if (!cartId) {
    const cart = await create_cart();
    cartId = cart.cartId;
  }

  const updatedCart = await add_to_cart({
    cartId,
    variantId: input.variantId,
    quantity: input.quantity ?? 1
  });

  const subtotal = Number(updatedCart.cost?.subtotalAmount?.amount ?? 0);
  return {
    ok: true,
    cartId,
    cart: updatedCart,
    actions: computeCommerceActions(subtotal),
    freeShippingThreshold: commerceConfig.freeShippingThreshold
  };
};
