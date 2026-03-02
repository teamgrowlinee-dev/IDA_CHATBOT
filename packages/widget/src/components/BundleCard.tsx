import { useState } from "react";
import type { Bundle, BundleItem, ProductCard } from "../types.js";

interface BundleCardProps {
  bundle: Bundle;
  onAddAll: (items: BundleItem[]) => void;
  onRemoveItem: (itemId: string) => void;
  onReplaceItem: (itemId: string, replacement: ProductCard) => void;
}

const ROLE_LABEL: Record<BundleItem["roleInBundle"], string> = {
  ankur: "Põhitoode",
  lisatoode: "Lisatoode",
  aksessuaar: "Aksessuaar"
};

export default function BundleCard({ bundle, onAddAll, onRemoveItem, onReplaceItem }: BundleCardProps) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [expandedAlternativeRows, setExpandedAlternativeRows] = useState<Set<string>>(new Set());

  const visibleItems = bundle.items.filter((item) => !removedIds.has(item.id));
  const visibleTotal = visibleItems.reduce(
    (s, item) => s + parseFloat(item.price?.replace(/[^0-9.]/g, "") ?? "0"), 0
  );
  const removedCount = bundle.items.length - visibleItems.length;

  const handleRemove = (id: string) => {
    setRemovedIds((prev) => new Set([...prev, id]));
    onRemoveItem(id);
  };

  const toggleAlternatives = (id: string) => {
    setExpandedAlternativeRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReplace = (itemId: string, replacement: ProductCard) => {
    onReplaceItem(itemId, replacement);
    setExpandedAlternativeRows((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  return (
    <div className="gl-bundle">
      <div className="gl-bundle-header">
        <div className="gl-bundle-title">{bundle.title}</div>
        <div className="gl-bundle-summary">{bundle.styleSummary}</div>
        <div className="gl-bundle-total">
          Kokku: {visibleTotal.toFixed(2)}€
          {removedCount > 0 && <span className="gl-bundle-removed-note"> ({removedCount} eemaldatud)</span>}
        </div>
      </div>

      <div className="gl-bundle-items">
        {visibleItems.map((item) => {
          const hasAlternatives = (item.alternatives?.length ?? 0) > 0;
          const alternativesExpanded = expandedAlternativeRows.has(item.id);

          return (
            <div key={item.id} className="gl-bundle-item-wrap">
              <div className="gl-bundle-item">
                {item.image && (
                  <img src={item.image} alt={item.title} className="gl-bundle-item-img" loading="lazy" />
                )}
                <div className="gl-bundle-item-info">
                  <div className="gl-bundle-item-role">{ROLE_LABEL[item.roleInBundle]}</div>
                  <div className="gl-bundle-item-title">
                    {item.permalink ? (
                      <a href={item.permalink} target="_blank" rel="noopener noreferrer">
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </div>
                  <div className="gl-bundle-item-price">{item.price}</div>
                  <div className="gl-bundle-item-why">{item.whyChosen}</div>
                  {hasAlternatives && (
                    <button
                      type="button"
                      className="gl-bundle-alts-toggle"
                      onClick={() => toggleAlternatives(item.id)}
                    >
                      {alternativesExpanded ? "Peida alternatiivid" : `Näita alternatiive (${item.alternatives?.length ?? 0})`}
                    </button>
                  )}
                </div>
                <button
                  className="gl-bundle-remove"
                  onClick={() => handleRemove(item.id)}
                  title="Eemalda komplektist"
                  aria-label="Eemalda"
                >
                  ✕
                </button>
              </div>

              {hasAlternatives && alternativesExpanded && (
                <div className="gl-bundle-alts-list">
                  {item.alternatives?.map((alt) => (
                    <div key={`${item.id}-${alt.id}`} className="gl-bundle-alt-item">
                      {alt.image && (
                        <img src={alt.image} alt={alt.title} className="gl-bundle-alt-img" loading="lazy" />
                      )}
                      <div className="gl-bundle-alt-info">
                        <div className="gl-bundle-alt-title">
                          {alt.permalink ? (
                            <a href={alt.permalink} target="_blank" rel="noopener noreferrer">
                              {alt.title}
                            </a>
                          ) : (
                            alt.title
                          )}
                        </div>
                        <div className="gl-bundle-alt-price">{alt.price}</div>
                      </div>
                      <button
                        type="button"
                        className="gl-bundle-alt-replace"
                        onClick={() => handleReplace(item.id, alt)}
                      >
                        Asenda
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {bundle.keyReasons.length > 0 && (
        <div className="gl-bundle-reasons">
          {bundle.keyReasons.map((r, i) => (
            <span key={i} className="gl-bundle-reason-tag">✓ {r}</span>
          ))}
        </div>
      )}

      {bundle.tradeoffs.length > 0 && (
        <div className="gl-bundle-tradeoffs">
          {bundle.tradeoffs.map((t, i) => (
            <div key={i} className="gl-bundle-tradeoff">⚠ {t}</div>
          ))}
        </div>
      )}

      <button
        className="gl-bundle-add-all"
        onClick={() => onAddAll(visibleItems)}
        disabled={visibleItems.length === 0}
      >
        Lisa komplekt ostukorvi ({visibleItems.length} toodet · {visibleTotal.toFixed(2)}€)
      </button>
    </div>
  );
}
