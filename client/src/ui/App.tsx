import { useGame } from "./GameContext";
import { MainMenu } from "./screens/MainMenu";
import { Lobby } from "./screens/Lobby";

export function App() {
  const { screen } = useGame();

  switch (screen) {
    case "lobby":
      return <Lobby />;
    case "menu":
    default:
      return <MainMenu />;
  }
}
