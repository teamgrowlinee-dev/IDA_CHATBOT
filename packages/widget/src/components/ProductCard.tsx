import React, { useState } from "react";
import type { ProductCard as ProductCardType } from "../types";

interface Props {
  card: ProductCardType;
  loading: boolean;
  onAdd: (card: ProductCardType) => void;
  onViewInSimulator: (card: ProductCardType) => void;
}

export const ProductCard: React.FC<Props> = ({ card, loading, onAdd, onViewInSimulator }) => {
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const hasAlternatives = (card.alternatives?.length ?? 0) > 0;

  return (
    <div className="gl-card">
      {card.image ? (
        <img src={card.image} alt={card.title} className="gl-card-img" loading="lazy" />
      ) : null}
      <div className="gl-card-body">
        <strong className="gl-card-title">{card.title}</strong>
        <div className="gl-card-price">
          <span>{card.price}</span>
          {card.compareAtPrice ? (
            <span className="gl-card-compare">{card.compareAtPrice}</span>
          ) : null}
        </div>
        {card.reason ? <p className="gl-card-reason">{card.reason}</p> : null}
        <div className="gl-card-actions">
          <button
            className="gl-card-add"
            disabled={loading}
            onClick={() => onAdd(card)}
            aria-label={`Lisa ${card.title} ostukorvi`}
          >
            {loading ? "Lisan..." : "Lisa ostukorvi"}
          </button>
          <button
            className="gl-card-sim"
            type="button"
            disabled={!card.simulatorAvailable}
            onClick={() => onViewInSimulator(card)}
            aria-label={`Vaata ${card.title} simulaatoris`}
            title={card.simulatorAvailable ? `Ava ${card.title} simulaatoris` : "Sellel tootel pole veel 3D mudelit"}
          >
            {card.simulatorAvailable ? "Ava simulaatoris" : "Simulaatoris pole saadaval"}
          </button>
          {hasAlternatives ? (
            <button
              className="gl-card-alts-toggle"
              type="button"
              onClick={() => setAlternativesOpen((prev) => !prev)}
            >
              {alternativesOpen
                ? "Peida alternatiivid"
                : `Näita alternatiive (${card.alternatives?.length ?? 0})`}
            </button>
          ) : null}
        </div>

        {hasAlternatives && alternativesOpen ? (
          <div className="gl-card-alts-list">
            {card.alternatives?.map((alternative) => (
              <div key={`${card.id}-${alternative.id}`} className="gl-card-alt-item">
                {alternative.image ? (
                  <img src={alternative.image} alt={alternative.title} className="gl-card-alt-img" loading="lazy" />
                ) : null}
                <div className="gl-card-alt-info">
                  <div className="gl-card-alt-title">
                    {alternative.permalink ? (
                      <a href={alternative.permalink} target="_blank" rel="noopener noreferrer">
                        {alternative.title}
                      </a>
                    ) : (
                      alternative.title
                    )}
                  </div>
                  <div className="gl-card-alt-price">{alternative.price}</div>
                </div>
                <div className="gl-card-alt-actions">
                  <button
                    className="gl-card-alt-btn"
                    type="button"
                    disabled={loading}
                    onClick={() => onAdd(alternative)}
                  >
                    Lisa
                  </button>
                  <button
                    className="gl-card-alt-btn gl-card-alt-btn-secondary"
                    type="button"
                    disabled={!alternative.simulatorAvailable}
                    onClick={() => onViewInSimulator(alternative)}
                    title={alternative.simulatorAvailable ? undefined : "Sellel tootel pole veel 3D mudelit"}
                  >
                    3D
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
