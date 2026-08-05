import { useEffect, useState } from "react";
import {
  SKINS,
  SKIN_COLORS,
  getSkin,
  loadSkinChoice,
  saveSkinChoice,
  skinColorCss,
  type Skin,
  type SkinChoice
} from "../../game/skins";

/**
 * Character customisation panel. Cosmetic only — nothing here affects speed,
 * size or hitboxes. The choice persists in localStorage and is handed to the
 * player entity on spawn.
 */
export function SkinPicker() {
  const [choice, setChoice] = useState<SkinChoice>(loadSkinChoice);

  useEffect(() => {
    saveSkinChoice(choice);
  }, [choice]);

  const skin = getSkin(choice.skinId);
  const css = skinColorCss(choice.colorId);

  return (
    <aside className="skin-panel" aria-label="Character customisation">
      <h2 className="skin-panel__title">Your robber</h2>

      <div className="skin-preview">
        <Avatar skin={skin} color={css} size={104} />
        <span className="skin-preview__name">{skin.name}</span>
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
            style={{ backgroundColor: `#${c.value.toString(16).padStart(6, "0")}` }}
            onClick={() => setChoice((p) => ({ ...p, colorId: c.id }))}
          />
        ))}
      </div>

      <span className="skin-panel__label">Skin</span>
      <div className="skin-grid">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.name}
            aria-pressed={choice.skinId === s.id}
            className={`skin-cell ${choice.skinId === s.id ? "is-on" : ""}`}
            onClick={() => setChoice((p) => ({ ...p, skinId: s.id }))}
          >
            <Avatar skin={s} color={css} size={38} />
          </button>
        ))}
      </div>
    </aside>
  );
}

/** SVG mirror of the in-game sprite, so the preview matches what you'll play. */
function Avatar({ skin, color, size }: { skin: Skin; color: string; size: number }) {
  // Drawn in a 48x48 box then scaled, matching the 12px in-game body radius.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {skin.accessory === "ears" && (
        <>
          <polygon points="10,16 22,16 16,4" fill={color} stroke="#000" strokeWidth="1.5" />
          <polygon points="26,16 38,16 32,4" fill={color} stroke="#000" strokeWidth="1.5" />
        </>
      )}
      {skin.accessory === "horns" && (
        <>
          <polygon points="10,17 17,17 13,5" fill="#d8452f" />
          <polygon points="31,17 38,17 35,5" fill="#d8452f" />
        </>
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

      <circle cx="24" cy="24" r="16" fill="none" stroke="#2c6f9e" strokeWidth="2.5" />
      <circle cx="19" cy="20" r="2.4" fill={skin.pattern === "mask" ? "#fff4d0" : "#0a0a0f"} />
      <circle cx="29" cy="20" r="2.4" fill={skin.pattern === "mask" ? "#fff4d0" : "#0a0a0f"} />

      {skin.accessory === "cap" && (
        <>
          <rect x="12" y="8" width="24" height="8" rx="2" fill="#2b2b45" />
          <rect x="28" y="14" width="14" height="4" rx="1.5" fill="#1d1d30" />
        </>
      )}
      {skin.accessory === "halo" && (
        <ellipse cx="24" cy="5" rx="11" ry="4" fill="none" stroke="#ffe488" strokeWidth="2.5" />
      )}
    </svg>
  );
}
