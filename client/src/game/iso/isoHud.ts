import Phaser from "phaser";
import { PALETTE, WORLD_H, WORLD_W } from "../house/houseLayout";

// ---------------------------------------------------------------------------
// In-canvas HUD text.
//
// These are the only two pieces of the original flat renderer that survived the
// isometric rewrite, because they were never world geometry to begin with —
// they are screen furniture. Everything is pinned with scrollFactor 0 so the
// camera can pan and zoom underneath them, and sits above MAX_WORLD_DEPTH so no
// wall can ever be drawn over a prompt.
// ---------------------------------------------------------------------------

/** Above every possible world depth. Guarded by the iso verifier. */
const HUD_DEPTH = 95000;

export interface InteractUi {
  interactPrompt: Phaser.GameObjects.Text;
  feedbackText: Phaser.GameObjects.Text;
}

export function buildInteractUi(scene: Phaser.Scene): InteractUi {
  const interactPrompt = scene.add
    .text(WORLD_W / 2, WORLD_H - 40, "", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "13px",
      color: PALETTE.interactHint,
      align: "center"
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(HUD_DEPTH)
    .setVisible(false);

  const feedbackText = scene.add
    .text(WORLD_W / 2, WORLD_H - 66, "", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "15px",
      color: "#e8e4f0",
      align: "center",
      fontStyle: "bold",
      stroke: "#06060a",
      strokeThickness: 4
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(HUD_DEPTH)
    .setAlpha(0);

  return { interactPrompt, feedbackText };
}

export function showInteractFeedback(
  scene: Phaser.Scene,
  feedbackText: Phaser.GameObjects.Text,
  message: string
) {
  feedbackText.setText(message);
  feedbackText.setAlpha(1);
  scene.tweens.killTweensOf(feedbackText);
  scene.tweens.add({
    targets: feedbackText,
    alpha: 0,
    duration: 1800,
    delay: 900,
    ease: "Quad.easeOut"
  });
}
