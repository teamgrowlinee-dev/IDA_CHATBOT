import type { Bundle, BundleItem } from "../types.js";

interface BundleCardProps {
  bundle: Bundle;
  onAddAll: (items: BundleItem[]) => void;
  onSwapItem?: (item: BundleItem) => void;
}

const ROLE_LABEL: Record<BundleItem["roleInBundle"], string> = {
  ankur: "Põhitoode",
  lisatoode: "Lisatoode",
  aksessuaar: "Aksessuaar"
};

export default function BundleCard({ bundle, onAddAll, onSwapItem }: BundleCardProps) {
  return (
    <div className="gl-bundle">
      <div className="gl-bundle-header">
        <div className="gl-bundle-title">{bundle.title}</div>
        <div className="gl-bundle-summary">{bundle.styleSummary}</div>
        <div className="gl-bundle-total">Kokku: {bundle.totalPrice.toFixed(2)}€</div>
      </div>

      <div className="gl-bundle-items">
        {bundle.items.map((item) => (
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
            {onSwapItem && (
              <button className="gl-bundle-swap" onClick={() => onSwapItem(item)} title="Vaheta toode">
                ↻
              </button>
            )}
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

      <button className="gl-bundle-add-all" onClick={() => onAddAll(bundle.items)}>
        Lisa kogu komplekt ostukorvi
      </button>
    </div>
  );
}
