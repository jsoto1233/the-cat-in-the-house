import { useGame } from "../GameContext";
import { Button } from "../components/Button";

const TEAM = [
  { name: "Ayman Ali", role: "Game Logic & AI" },
  { name: "Jose Soldevilla", role: "Gameplay & UI" },
  { name: "Vincent Hua", role: "Backend & Networking" }
];

export function Credits() {
  const { navigate } = useGame();

  return (
    <div className="screen">
      <div className="screen__inner">
        <div className="brand">
          <h1 className="brand__title">Credits</h1>
          <p className="brand__subtitle">Senior Design — Spring 2026</p>
          <p className="credits-premise">While the family is away, four robbers hit a quiet mansion for valuables — until a seemingly normal cat reveals something far worse.</p>
        </div>

        <div className="panel">
          <ul className="credits-list">
            {TEAM.map((member) => (
              <li key={member.name}>
                <span>{member.name}</span>
                <span className="role">{member.role}</span>
              </li>
            ))}
          </ul>
          <Button onClick={() => navigate("menu")}>Back to menu</Button>
        </div>
      </div>
    </div>
  );
}
