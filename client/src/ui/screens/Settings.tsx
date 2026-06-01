import { useGame } from "../GameContext";
import { Button } from "../components/Button";

export function Settings() {
  const { settings, updateSettings, back } = useGame();

  return (
    <div className="screen">
      <div className="screen__inner">
        <div className="brand">
          <h1 className="brand__title">Settings</h1>
        </div>

        <div className="panel">
          <div className="field">
            <label className="field__label" htmlFor="master">
              Master volume — {settings.master}%
            </label>
            <input
              id="master"
              className="range"
              type="range"
              min={0}
              max={100}
              value={settings.master}
              onChange={(e) => updateSettings({ master: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sfx">
              Sound effects — {settings.sfx}%
            </label>
            <input
              id="sfx"
              className="range"
              type="range"
              min={0}
              max={100}
              value={settings.sfx}
              onChange={(e) => updateSettings({ sfx: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="music">
              Music — {settings.music}%
            </label>
            <input
              id="music"
              className="range"
              type="range"
              min={0}
              max={100}
              value={settings.music}
              onChange={(e) => updateSettings({ music: Number(e.target.value) })}
            />
          </div>

          <div className="divider" />
          <Button onClick={back}>Save &amp; back</Button>
        </div>
      </div>
    </div>
  );
}
