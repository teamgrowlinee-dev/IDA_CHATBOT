import { useState } from "react";
import type { Bundle, BundleItem } from "../types.js";

interface BundleCardProps {
  bundle: Bundle;
  onAddAll: (items: BundleItem[]) => void;
  onRemoveItem: (itemId: string) => void;
}

const ROLE_LABEL: Record<BundleItem["roleInBundle"], string> = {
  ankur: "Põhitoode",
  lisatoode: "Lisatoode",
  aksessuaar: "Aksessuaar"
};

export default function BundleCard({ bundle, onAddAll, onRemoveItem }: BundleCardProps) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const visibleItems = bundle.items.filter((item) => !removedIds.has(item.id));
  const visibleTotal = visibleItems.reduce(
    (s, item) => s + parseFloat(item.price?.replace(/[^0-9.]/g, "") ?? "0"), 0
  );
  const removedCount = bundle.items.length - visibleItems.length;

  const handleRemove = (id: string) => {
    setRemovedIds((prev) => new Set([...prev, id]));
    onRemoveItem(id);
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
        {visibleItems.map((item) => (
          <div key={item.id} className="gl-bundle-item">
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
        ))}
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
