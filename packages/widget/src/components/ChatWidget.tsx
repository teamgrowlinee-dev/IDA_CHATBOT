import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Bundle, BundleAnswers, BundleItem, ChatMessage, ChatResponse, CommerceActions, ProductCard as ProductCardType } from "../types";
import { ProductCard } from "./ProductCard";
import BundleFlow from "./BundleFlow";
import BundleCard from "./BundleCard";

interface Props {
  apiBase: string;
  brandName: string;
  storeOrigin: string;
}

let msgCounter = 0;
const nextId = () => `msg-${++msgCounter}`;

export const ChatWidget: React.FC<Props> = ({ apiBase, brandName, storeOrigin }) => {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem("gl_chat_open") === "1";
    } catch {}
    return false;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cartId, setCartId] = useState<string | undefined>();
  const [actions, setActions] = useState<CommerceActions>({});
  const [addingVariant, setAddingVariant] = useState<string | null>(null);

  const [welcomeTyping, setWelcomeTyping] = useState(false);
  const [welcomeText, setWelcomeText] = useState("");

  const [bundleFlowActive, setBundleFlowActive] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleResults, setBundleResults] = useState<Bundle[] | null>(null);

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, loading, welcomeText]);

  useEffect(() => {
    try {
      sessionStorage.setItem("gl_chat_open", open ? "1" : "0");
    } catch {}
  }, [open]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const maxHeight = 132;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input, open]);

  useEffect(() => {
    if (!open || messages.length > 0) return;

    const welcomeMsg = `Tere! Olen ${brandName} abistaja. Saan aidata tarne, tagastuse, tingimuste ja muu klienditoe infoga. Samuti saad kirjeldada, millist toodet otsid, ja leian sulle sobivad valikud.`;
    setWelcomeTyping(true);
    setWelcomeText("");

    let i = 0;
    const typeInterval = setInterval(() => {
      i += 1;
      setWelcomeText(welcomeMsg.slice(0, i));
      if (i >= welcomeMsg.length) {
        clearInterval(typeInterval);
        setWelcomeTyping(false);
        setMessages([{ id: nextId(), role: "assistant", text: welcomeMsg }]);
        setWelcomeText("");
        setSuggestions(["Tarne info", "Tagastamine", "Tingimused", "Makse ja tarne", "Kontakt"]);
      }
    }, 20);

    return () => clearInterval(typeInterval);
  }, [open, brandName, messages.length]);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: ChatMessage = { id: nextId(), role: "user", text: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setSuggestions([]);

      try {
        const history = messages
          .slice(-10)
          .map((m) => ({ role: m.role, text: m.text }))
          .filter((m) => m.text && typeof m.text === "string");

        const res = await fetch(`${apiBase}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim(), cartId, history })
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = payload?.error || payload?.userMessage || "Vabandust, praegu ei saanud vastata.";
          throw new Error(msg);
        }

        const data: ChatResponse = payload;

        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: "assistant",
          text: data.message,
          cards: data.cards?.length ? data.cards : undefined,
          productSummary: data.productSummary || undefined
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setSuggestions(data.suggestions ?? []);
        if (data.cartId) setCartId(data.cartId);
        if (data.actions) setActions(data.actions);
      } catch (err) {
        console.error("[IDA] Chat error:", err);
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Vabandust, tekkis viga. Palun proovi uuesti.";

        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: message }]);
      } finally {
        setLoading(false);
      }
    },
    [apiBase, cartId, loading, messages]
  );

  const handleAddToCart = useCallback(
    async (card: ProductCardType) => {
      setAddingVariant(card.variantId);

      const safeStoreOrigin = (() => {
        try {
          return new URL(storeOrigin).origin;
        } catch {
          return window.location.origin;
        }
      })();

      const toNumericId = (value?: string) => {
        const raw = String(value ?? "").trim();
        const numeric = Number(raw);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
      };

      const productId = toNumericId(card.variantId) ?? toNumericId(card.id);
      const productUrl = card.permalink || (card.handle ? `${safeStoreOrigin}/toode/${card.handle}/` : safeStoreOrigin);

      try {
        if (productId && safeStoreOrigin === window.location.origin) {
          const body = new URLSearchParams();
          body.set("product_id", String(productId));
          body.set("quantity", "1");

          const response = await fetch("/?wc-ajax=add_to_cart", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Accept: "application/json"
            },
            body: body.toString()
          });

          if (response.ok) {
            setMessages((prev) => [
              ...prev,
              { id: nextId(), role: "assistant", text: `${card.title} lisatud ostukorvi!` }
            ]);
            return;
          }

          window.location.href = `/?add-to-cart=${productId}`;
          return;
        }

        window.open(productUrl, "_blank", "noopener,noreferrer");
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: `Avasin toote uues aknas: ${card.title}`
          }
        ]);
      } catch (err) {
        console.error("[IDA] Add to cart error:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: `Toodet ei saanud otse ostukorvi lisada. Vaata toodet siit: ${productUrl}`
          }
        ]);
      } finally {
        setAddingVariant(null);
      }
    },
    [storeOrigin]
  );

  const handleRemoveBundleItem = useCallback((bundleIndex: number, itemId: string) => {
    setBundleResults((prev) => {
      if (!prev) return prev;
      return prev.map((bundle, i) => {
        if (i !== bundleIndex) return bundle;
        const items = bundle.items.filter((item) => item.id !== itemId);
        const totalPrice = items.reduce(
          (s, item) => s + parseFloat(item.price?.replace(/[^0-9.]/g, "") ?? "0"), 0
        );
        return { ...bundle, items, totalPrice };
      });
    });
  }, []);

  const handleBundleComplete = useCallback(
    async (answers: BundleAnswers) => {
      setBundleLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/bundle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(answers)
        });
        const data = await res.json();
        setBundleResults(data.bundles ?? []);
      } catch (err) {
        console.error("[IDA] Bundle error:", err);
        setBundleResults([]);
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: "Komplektide genereerimine ebaõnnestus. Palun proovi uuesti." }
        ]);
        setBundleFlowActive(false);
      } finally {
        setBundleLoading(false);
      }
    },
    [apiBase]
  );

  const handleAddAllToCart = useCallback(
    async (items: BundleItem[]) => {
      const safeStoreOrigin = (() => {
        try { return new URL(storeOrigin).origin; } catch { return window.location.origin; }
      })();
      const sameOrigin = safeStoreOrigin === window.location.origin;

      setBundleResults(null);
      setBundleFlowActive(false);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: `Lisan ${items.length} toodet ostukorvi...` }
      ]);

      let added = 0;
      const failed: BundleItem[] = [];

      for (const item of items) {
        const productId = (() => {
          const n = Number(String(item.variantId ?? item.id).trim());
          return Number.isFinite(n) && n > 0 ? n : null;
        })();

        if (productId && sameOrigin) {
          try {
            const body = new URLSearchParams();
            body.set("product_id", String(productId));
            body.set("quantity", "1");
            const res = await fetch("/?wc-ajax=add_to_cart", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "application/json" },
              body: body.toString()
            });
            if (res.ok) { added++; continue; }
          } catch { /* fall through */ }
        }
        failed.push(item);
      }

      if (added > 0 && failed.length === 0) {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: `Kõik ${added} toodet lisatud ostukorvi! Vaata ostukorvi: ${safeStoreOrigin}/ostukorv/` }
        ]);
      } else if (added > 0) {
        const failedTitles = failed.map((f) => f.title).join(", ");
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: `${added} toodet lisatud. Neid tooteid ei saanud lisada: ${failedTitles}. Vaata otse: ${safeStoreOrigin}/ostukorv/` }
        ]);
      } else {
        // Cross-origin or all failed — open cart/product pages
        for (const item of items) {
          const url = item.permalink || `${safeStoreOrigin}/toode/${item.handle}/`;
          window.open(url, "_blank", "noopener,noreferrer");
        }
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: "Avasin kõik tooted uutes aknadesignis. Lisa need käsitsi ostukorvi." }
        ]);
      }
    },
    [storeOrigin]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const bubbleMessages = [
    `Tere! Mina olen ${brandName} assistent.`,
    "Aitan leida tooteid kirjelduse järgi ja vastan poe tingimuste kohta.",
    "Vajuta mu peale ja alustame!"
  ];
  const PAUSE_BETWEEN_ROUNDS = 60_000;
  const [bubbleText, setBubbleText] = useState("");
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setBubbleVisible(false);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      return;
    }

    let msgIdx = 0;
    let cancelled = false;

    const showNext = () => {
      if (cancelled) return;

      setBubbleText(bubbleMessages[msgIdx]);
      setBubbleVisible(true);

      bubbleTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        setBubbleVisible(false);

        msgIdx += 1;

        if (msgIdx < bubbleMessages.length) {
          bubbleTimerRef.current = setTimeout(() => {
            if (!cancelled) showNext();
          }, 800);
        } else {
          msgIdx = 0;
          bubbleTimerRef.current = setTimeout(() => {
            if (!cancelled) showNext();
          }, PAUSE_BETWEEN_ROUNDS);
        }
      }, 4000);
    };

    bubbleTimerRef.current = setTimeout(showNext, 1500);

    return () => {
      cancelled = true;
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, [open, brandName]);

  if (!open) {
    return (
      <div className="gl-root">
        <div className="gl-fab-wrap">
          {bubbleVisible && bubbleText && (
            <div className="gl-bubble" onClick={handleOpen}>
              {bubbleText}
            </div>
          )}
          <button className="gl-fab" onClick={handleOpen} aria-label="Ava vestlus">
            <span className="gl-fab-icon">{"💬"}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gl-root">
      <div className="gl-panel">
        <div className="gl-bg" />

        <div className="gl-header">
          <div className="gl-brand">
            <div className="gl-dot" />
            <div>
              <strong>{brandName}</strong>
              <small>Online</small>
              <a
                className="gl-powered gl-powered-link"
                href="https://growlinee.com/ee"
                target="_blank"
                rel="noopener noreferrer"
              >
                Powered by Growlinee
              </a>
            </div>
          </div>
          <div className="gl-header-actions">
            <button onClick={handleClose} aria-label="Minimeeri">
              {"−"}
            </button>
            <button onClick={handleClose} aria-label="Sulge">
              {"✕"}
            </button>
          </div>
        </div>

        {bundleFlowActive && !bundleResults && !bundleLoading && (
          <BundleFlow
            onComplete={handleBundleComplete}
            onCancel={() => setBundleFlowActive(false)}
          />
        )}

        {bundleLoading && (
          <div className="gl-messages">
            <div className="gl-msg assistant">
              <p>Genereerin sinu personaalseid komplekte...</p>
              <div className="gl-typing">
                <div className="gl-typing-dot" />
                <div className="gl-typing-dot" />
                <div className="gl-typing-dot" />
              </div>
            </div>
          </div>
        )}

        {!bundleFlowActive && !bundleLoading && (
          <div className="gl-messages" ref={messagesRef}>
            {welcomeTyping && messages.length === 0 && (
              <div className="gl-msg assistant">
                <p>
                  {welcomeText}
                  <span className="gl-bubble-cursor" />
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`gl-msg ${msg.role}`}>
                <p>{msg.text}</p>
                {msg.cards?.map((card) => (
                  <ProductCard
                    key={`${card.variantId}-${card.id}`}
                    card={card}
                    loading={addingVariant === card.variantId}
                    onAdd={handleAddToCart}
                  />
                ))}
                {msg.productSummary && <div className="gl-product-summary">{msg.productSummary}</div>}
              </div>
            ))}

            {bundleResults && bundleResults.length > 0 && (
              <div className="gl-bundle-results">
                <div className="gl-msg assistant"><p>Siin on sinu personaalsed komplektid:</p></div>
                {bundleResults.map((bundle, i) => (
                  <BundleCard
                    key={i}
                    bundle={bundle}
                    onAddAll={handleAddAllToCart}
                    onRemoveItem={(itemId) => handleRemoveBundleItem(i, itemId)}
                  />
                ))}
                <button
                  className="gl-bundle-back"
                  onClick={() => { setBundleResults(null); setBundleFlowActive(false); }}
                >
                  ← Tagasi chatti
                </button>
              </div>
            )}

            {bundleResults && bundleResults.length === 0 && (
              <div className="gl-msg assistant">
                <p>Kahjuks ei leidnud sobivaid tooteid antud kriteeriumitele. Proovi muuta eelarvet või stiilieelistust.</p>
                <button
                  className="gl-bundle-back"
                  onClick={() => { setBundleResults(null); setBundleFlowActive(false); }}
                >
                  ← Proovi uuesti
                </button>
              </div>
            )}

            {loading && (
              <div className="gl-msg assistant">
                <div className="gl-typing">
                  <div className="gl-typing-dot" />
                  <div className="gl-typing-dot" />
                  <div className="gl-typing-dot" />
                </div>
              </div>
            )}
          </div>
        )}

        {actions.freeShippingGap && actions.freeShippingGap > 0 ? (
          <div className="gl-chips">
            <button onClick={() => sendMessage("Soovita tooteid")}>{"Veel " + actions.freeShippingGap.toFixed(2) + "\u20AC tasuta tarneni"}</button>
          </div>
        ) : null}

        {actions.applyDiscountHint ? (
          <div className="gl-chips">
            <button onClick={() => sendMessage("Soovita tooteid")}>{actions.applyDiscountHint}</button>
          </div>
        ) : null}

        {suggestions.length > 0 && !welcomeTyping && !bundleFlowActive && !bundleResults && (
          <div className="gl-chips">
            {suggestions.map((chip) => (
              <button key={chip} onClick={() => sendMessage(chip)}>
                {chip}
              </button>
            ))}
          </div>
        )}

        {!bundleFlowActive && !bundleResults && !welcomeTyping && messages.length > 0 && (
          <div className="gl-quick-actions">
            <button onClick={() => setBundleFlowActive(true)}>🛋️ Koosta komplekt</button>
            <button disabled title="Tulemas peagi">📐 Ruumisobivus</button>
          </div>
        )}

        {!bundleFlowActive && !bundleLoading && (
          <div className="gl-footer">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={"Küsi toote kohta või küsi poe tingimuste kohta"}
              disabled={loading || welcomeTyping}
              rows={1}
              aria-label="Vestluse sisestus"
            />
            <button onClick={() => sendMessage(input)} disabled={loading || welcomeTyping || !input.trim()}>
              {"Saada"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
