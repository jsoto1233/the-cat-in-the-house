import { useEffect, useState } from "react";
import {
  SKINS,
  SKIN_COLORS,
  getSkin,
  isUnlocked,
  loadSkinChoice,
  resolveSkinColor,
  saveSkinChoice,
  unlockLabel,
  unlockProgress,
  type Skin,
  type SkinChoice
} from "../../game/skins";
import {
  getProgress,
  purchaseSkin,
  subscribeProgress,
  type Progress
} from "../../game/progress";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/**
 * Character customisation and skin shop. Everything here is cosmetic — a skin
 * never changes speed, size or hitbox — so unlocks are stored locally and are
 * not worth cheating for.
 */
export function SkinPicker() {
  const [choice, setChoice] = useState<SkinChoice>(loadSkinChoice);
  const [progress, setProgress] = useState<Progress>(getProgress);
  const [selected, setSelected] = useState<string>(choice.skinId);

  useEffect(() => subscribeProgress(setProgress), []);
  useEffect(() => {
    saveSkinChoice(choice);
  }, [choice]);

  const equipped = getSkin(choice.skinId);
  const shown = getSkin(selected);
  const shownUnlocked = isUnlocked(shown);
  const requirement = unlockLabel(shown);
  const pct = Math.round(unlockProgress(shown) * 100);

  const equip = (s: Skin) => {
    setSelected(s.id);
    if (isUnlocked(s)) setChoice((p) => ({ ...p, skinId: s.id }));
  };

  const buy = (s: Skin) => {
    if (s.unlock.kind !== "cash") return;
    if (purchaseSkin(s.id, s.unlock.cost)) {
      setChoice((p) => ({ ...p, skinId: s.id }));
    }
  };

  return (
    <aside className="skin-panel" aria-label="Character customisation">
      <h2 className="skin-panel__title">Your robber</h2>

      <div className="skin-preview">
        <Avatar skin={shown} color={hex(resolveSkinColor(shown, choice.colorId))} size={104} />
        <span className="skin-preview__name">
          {shown.name}
          {shown.id === choice.skinId && <span className="skin-badge">EQUIPPED</span>}
        </span>
      </div>

      {/* Unlock state for whichever skin is being previewed. */}
      {!shownUnlocked && (
        <div className="skin-lockinfo">
          <div className="skin-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          {shown.unlock.kind === "cash" ? (
            <button
              className="skin-buy"
              disabled={progress.bank < shown.unlock.cost}
              onClick={() => buy(shown)}
            >
              Buy {requirement}
            </button>
          ) : (
            <span className="skin-req">{requirement}</span>
          )}
        </div>
      )}

      <div className="skin-bank">
        <span>Bank</span>
        <strong>${progress.bank.toLocaleString()}</strong>
        <span className="skin-bank__lvl">Best L{progress.bestLevel}</span>
      </div>

      <span className="skin-panel__label">Colour</span>
      <div className="skin-swatches">
        {SKIN_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={choice.colorId === c.id}
            className={`skin-swatch ${choice.colorId === c.id ? "is-on" : ""}`}
            style={{ backgroundColor: hex(c.value) }}
            onClick={() => setChoice((p) => ({ ...p, colorId: c.id }))}
          />
        ))}
      </div>

      <span className="skin-panel__label">Skins</span>
      <div className="skin-grid">
        {SKINS.map((s) => {
          const unlocked = isUnlocked(s);
          return (
            <button
              key={s.id}
              type="button"
              title={unlocked ? s.name : `${s.name} — ${unlockLabel(s)}`}
              aria-pressed={choice.skinId === s.id}
              className={`skin-cell ${choice.skinId === s.id ? "is-on" : ""} ${
                selected === s.id ? "is-sel" : ""
              } ${unlocked ? "" : "is-locked"}`}
              onClick={() => equip(s)}
            >
              <Avatar skin={s} color={hex(resolveSkinColor(s, choice.colorId))} size={36} />
              {!unlocked && <span className="skin-lock">🔒</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/** SVG mirror of the in-game sprite, so the preview matches what you'll play. */
function Avatar({ skin, color, size }: { skin: Skin; color: string; size: number }) {
  const eye = skin.eyeGlow
    ? hex(skin.eyeGlow)
    : skin.pattern === "mask" || skin.pattern === "panda"
      ? "#fff4d0"
      : "#0a0a0f";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      opacity={skin.alpha ?? 1}
    >
      {skin.glow && <circle cx="24" cy="24" r="22" fill={color} opacity="0.22" />}

      {skin.accessory === "ears" && (
        <>
          <polygon points="10,16 22,16 16,4" fill={color} stroke="#000" strokeWidth="1.5" />
          <polygon points="26,16 38,16 32,4" fill={color} stroke="#000" strokeWidth="1.5" />
        </>
      )}
      {skin.accessory === "antenna" && (
        <>
          <rect x="13" y="2" width="2" height="10" fill={color} />
          <rect x="33" y="2" width="2" height="10" fill={color} />
          <circle cx="14" cy="2" r="3" fill={color} />
          <circle cx="34" cy="2" r="3" fill={color} />
        </>
      )}
      {skin.accessory === "sheet" && (
        <g fill={color} opacity="0.75">
          <polygon points="8,36 18,36 13,45" />
          <polygon points="18,36 28,36 23,45" />
          <polygon points="28,36 38,36 33,45" />
        </g>
      )}

      <circle cx="24" cy="24" r="16" fill={color} />

      {skin.pattern === "stripe" && (
        <g opacity="0.32">
          <rect x="9" y="16" width="30" height="4" fill="#000" />
          <rect x="8" y="24" width="32" height="4" fill="#000" />
          <rect x="12" y="32" width="24" height="4" fill="#000" />
        </g>
      )}
      {skin.pattern === "spots" && (
        <g opacity="0.3" fill="#000">
          <circle cx="17" cy="19" r="4" />
          <circle cx="31" cy="27" r="3.2" />
          <circle cx="21" cy="32" r="2.6" />
        </g>
      )}
      {skin.pattern === "mask" && (
        <rect x="8" y="16" width="32" height="9" fill="#14141c" opacity="0.85" />
      )}
      {skin.pattern === "panda" && (
        <g fill="#1b1b22" opacity="0.9">
          <circle cx="18" cy="21" r="5.5" />
          <circle cx="30" cy="21" r="5.5" />
        </g>
      )}
      {skin.pattern === "circuit" && (
        <g opacity="0.8">
          <rect x="10" y="16" width="28" height="1.8" fill="#0a2a30" />
          <rect x="8" y="28" width="32" height="1.8" fill="#0a2a30" />
          <rect x="17" y="20" width="1.8" height="11" fill="#0a2a30" />
          <circle cx="32" cy="29" r="2" fill="#fff27a" />
        </g>
      )}
      {skin.pattern === "skull" && (
        <g>
          <circle cx="18" cy="21" r="4.6" fill="#1b1b22" />
          <circle cx="30" cy="21" r="4.6" fill="#1b1b22" />
          <rect x="19" y="31" width="10" height="6" fill="#1b1b22" opacity="0.9" />
          <rect x="23.2" y="31" width="1.6" height="6" fill={color} />
        </g>
      )}

      {skin.pattern !== "skull" && (
        <>
          <circle cx="19" cy="20" r={skin.accessory === "antenna" ? 3.4 : 2.4} fill={eye} />
          <circle cx="29" cy="20" r={skin.accessory === "antenna" ? 3.4 : 2.4} fill={eye} />
        </>
      )}

      {skin.accessory === "cap" && (
        <>
          <rect x="12" y="8" width="24" height="8" rx="2" fill="#2b2b45" />
          <rect x="28" y="14" width="14" height="4" rx="1.5" fill="#1d1d30" />
        </>
      )}
      {skin.accessory === "beanie" && (
        <>
          <rect x="11" y="7" width="26" height="9" rx="3" fill="#3b4a63" />
          <rect x="10" y="14" width="28" height="4" rx="1.5" fill="#2a374c" />
          <circle cx="24" cy="4" r="3.2" fill="#53506a" />
        </>
      )}
      {skin.accessory === "crown" && (
        <g fill="#ffd633">
          <rect x="15" y="6" width="18" height="4" />
          <polygon points="14,7 18,7 16,1" />
          <polygon points="22,7 26,7 24,0" />
          <polygon points="30,7 34,7 32,1" />
        </g>
      )}
      {skin.accessory === "halo" && (
        <ellipse cx="24" cy="5" rx="11" ry="4" fill="none" stroke="#ffe488" strokeWidth="2.5" />
      )}
    </svg>
  );
}
