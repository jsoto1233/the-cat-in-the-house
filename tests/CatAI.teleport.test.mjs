import test from 'node:test';
import assert from 'node:assert/strict';
import { CatAI } from '../CatAI.js';
import { CollisionMap } from '../CollisionMap.js';

function makeCollisionMap() {
  const tileW = 20;
  const tileH = 20;
  const grid = [
    [true, false, true, true],
    [true, true, true, true],
    [true, true, true, true],
    [true, true, true, true],
  ];
  return new CollisionMap(tileW, tileH, grid);
}

test('cat movement stops before crossing a blocked tile', () => {
  const collisionMap = makeCollisionMap();
  const cat = new CatAI(null, { x: 10, y: 10 }, 100, 100, collisionMap);
  cat.speed = 1000;
  cat._stepToward({ x: 50, y: 10 }, 1);
  assert.ok(cat.x < 30, `expected cat to stop before the wall, got x=${cat.x}`);
});

test('teleport briefly reduces the cat movement speed', () => {
  const cat = new CatAI({ x: 10, y: 10 }, 100, 100, null);
  cat.speed = 100;
  cat._triggerTeleportSlowdown(0.5);
  assert.equal(cat._effectiveSpeed(), 35);
});
