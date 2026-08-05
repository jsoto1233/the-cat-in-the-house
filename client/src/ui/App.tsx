import { useGame } from "./GameContext";
import { MainMenu } from "./screens/MainMenu";
import { Lobby } from "./screens/Lobby";
import { GameView } from "./screens/GameView";
import { EndScreen } from "./screens/EndScreen";
import { MusicPlayer } from "./components/MusicPlayer";
import { DevOverlay } from "./components/DevOverlay";

export function App() {
  const { screen, gameSessionKey } = useGame();

  let current;
  switch (screen) {
    case "lobby":
      current = <Lobby />;
      break;
    case "game":
      current = <GameView key={gameSessionKey} />;
      break;
    case "end":
      current = <EndScreen />;
      break;
    case "menu":
    default:
      current = <MainMenu />;
  }

  return (
    <>
      {current}
      {/* Always mounted so the music keeps playing across screen changes. */}
      <MusicPlayer />
      {/* Cmd/Ctrl+Shift+D or ~ — local visualisation only; see devAccess.ts. */}
      <DevOverlay />
    </>
  );
}
