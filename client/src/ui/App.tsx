import { useGame } from "./GameContext";
import { MainMenu } from "./screens/MainMenu";
import { Lobby } from "./screens/Lobby";
import { GameView } from "./screens/GameView";
import { Credits } from "./screens/Credits";
import { EndScreen } from "./screens/EndScreen";
import { MusicPlayer } from "./components/MusicPlayer";
import { StartSplash } from "./components/StartSplash";

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
    case "credits":
      current = <Credits />;
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
      {/* First-click gate: dismissing it unlocks + starts the music. */}
      <StartSplash />
    </>
  );
}
