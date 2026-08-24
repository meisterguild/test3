import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CONTAINER_FLOOR_Y,
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  DEADLINE_Y,
  DROP_Y,
  ENABLE_SLEEPING,
  GRAVITY_Y,
  MAX_PHYSICS_STEPS_PER_FRAME,
  PHYSICS_TIMESTEP_MS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  WALL_THICKNESS,
} from '../../src/game/constants';
import { FRUITS } from '../../src/game/fruits';

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');
}

/**
 * 契約点 §5 の値どうしの整合と、TypeScript の外（index.html / style.css）に
 * 複製されている論理座標系の値が乖離していないことを固定する（R-02）。
 *
 * CSS / HTML は TypeScript の定数を import できないため、値の複製自体は避けられない。
 * 「複製を検知して落ちるテスト」を置くことで、片方だけ変えて壊れるのを防ぐ。
 */
describe('盤面定数（契約点 §5）', () => {
  it('index.html の canvas 属性が論理座標系と一致する', () => {
    const html = readRepoFile('index.html');
    expect(html).toContain(`width="${STAGE_WIDTH}"`);
    expect(html).toContain(`height="${STAGE_HEIGHT}"`);
  });

  it('style.css の --stage-aspect が論理座標系の比率と一致する', () => {
    const css = readRepoFile('src/style.css');
    expect(css).toContain(`--stage-aspect: ${STAGE_WIDTH} / ${STAGE_HEIGHT};`);
  });

  it('容器は論理座標系の内側に収まる', () => {
    expect(CONTAINER_LEFT - WALL_THICKNESS).toBeGreaterThanOrEqual(0);
    expect(CONTAINER_RIGHT + WALL_THICKNESS).toBeLessThanOrEqual(STAGE_WIDTH);
    expect(CONTAINER_FLOOR_Y + WALL_THICKNESS).toBeLessThanOrEqual(STAGE_HEIGHT);
    expect(CONTAINER_LEFT).toBeLessThan(CONTAINER_RIGHT);
  });

  it('最大の果物（スイカ）が容器の内幅に収まる', () => {
    const maxDiameter = Math.max(...FRUITS.map((fruit) => fruit.radius)) * 2;
    expect(maxDiameter).toBeLessThan(CONTAINER_RIGHT - CONTAINER_LEFT);
  });

  it('ドロップ位置はデッドラインより上にある（R-2: ドロップ即ゲームオーバーを避ける）', () => {
    expect(DROP_Y).toBeLessThan(DEADLINE_Y);
  });

  it('物理パラメータが実装の前提を満たす', () => {
    expect(GRAVITY_Y).toBeGreaterThan(0);
    // NFR-01 / R-05: スリープを切ると 60 個の常時計算になるため固定する
    expect(ENABLE_SLEEPING).toBe(true);
    expect(PHYSICS_TIMESTEP_MS).toBeGreaterThan(0);
    expect(MAX_PHYSICS_STEPS_PER_FRAME).toBeGreaterThanOrEqual(1);
  });
});
