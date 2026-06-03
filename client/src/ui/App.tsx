import { useGame } from "./GameContext";
import { MainMenu } from "./screens/MainMenu";
import { Lobby } from "./screens/Lobby";
import { GameView } from "./screens/GameView";
import { Settings } from "./screens/Settings";
import { Credits } from "./screens/Credits";
import { EndScreen } from "./screens/EndScreen";

export function App() {
  const { screen } = useGame();

  switch (screen) {
    case "lobby":
      return <Lobby />;
    case "game":
      return <GameView />;
    case "settings":
      return <Settings />;
    case "credits":
      return <Credits />;
    case "end":
      return <EndScreen />;
    case "menu":
    default:
      return <MainMenu />;
  }
}
