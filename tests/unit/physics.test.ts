import { describe, expect, it } from 'vitest';

import {
  CONTAINER_FLOOR_Y,
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  DROP_Y,
  PHYSICS_TIMESTEP_MS,
  MAX_PHYSICS_STEPS_PER_FRAME,
  SPAWN_ACTIVE_CONTACT_STEPS,
} from '../../src/game/constants';
import { FRUITS } from '../../src/game/fruits';
import { createPhysicsWorld, type FruitContact } from '../../src/game/physics';

/** `deltaMs` を `ms` 分だけ進める（フレーム相当のステップを繰り返す） */
function advance(world: ReturnType<typeof createPhysicsWorld>, ms: number): void {
  const frameMs = PHYSICS_TIMESTEP_MS;
  for (let elapsed = 0; elapsed < ms; elapsed += frameMs) {
    world.step(frameMs);
  }
}

describe('createPhysicsWorld', () => {
  it('addFruit は tier と一意な fruitId を持つ剛体を返す', () => {
    const world = createPhysicsWorld();
    const first = world.addFruit(0, 240, DROP_Y);
    const second = world.addFruit(0, 260, DROP_Y);

    expect(first.tier).toBe(0);
    expect(first.circleRadius).toBe(FRUITS[0]?.radius);
    expect(second.fruitId).not.toBe(first.fruitId);
    expect(world.fruitCount()).toBe(2);
    world.dispose();
  });

  it('[FR-02] 果物は重力で落下して床の上で止まる（床を貫通しない）', () => {
    const world = createPhysicsWorld();
    const fruit = world.addFruit(0, 240, DROP_Y);
    const radius = FRUITS[0]?.radius ?? 0;

    advance(world, 3000);

    const [snapshot] = world.snapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot?.y).toBeGreaterThan(DROP_Y);
    // 床の上面に接した位置（中心 = 床 - 半径）に収まっていること。沈み込みの許容は 2px
    expect(fruit.position.y).toBeGreaterThan(CONTAINER_FLOOR_Y - radius - 2);
    expect(fruit.position.y).toBeLessThan(CONTAINER_FLOOR_Y - radius + 2);
    world.dispose();
  });

  it('[FR-02] 果物は壁を貫通せず容器の内側に留まる', () => {
    const world = createPhysicsWorld();
    // 壁際へ寄せて落とす（左右それぞれ）
    world.addFruit(2, CONTAINER_LEFT + 1, DROP_Y);
    world.addFruit(2, CONTAINER_RIGHT - 1, DROP_Y);

    advance(world, 3000);

    for (const fruit of world.snapshot()) {
      expect(fruit.x - fruit.radius).toBeGreaterThan(CONTAINER_LEFT - 2);
      expect(fruit.x + fruit.radius).toBeLessThan(CONTAINER_RIGHT + 2);
    }
    world.dispose();
  });

  it('[FR-02] 果物は他の果物の上に積み上がる', () => {
    const world = createPhysicsWorld();
    const radius = FRUITS[3]?.radius ?? 0;
    const lower = world.addFruit(3, 240, CONTAINER_FLOOR_Y - radius);
    const upper = world.addFruit(3, 240, CONTAINER_FLOOR_Y - radius * 3);

    advance(world, 3000);

    // 上の果物は下の果物より高い位置（y が小さい）で止まり、めり込んでいない
    expect(upper.position.y).toBeLessThan(lower.position.y);
    expect(lower.position.y - upper.position.y).toBeGreaterThan(radius);
    world.dispose();
  });

  it('[R-05] 静止した果物は sleeping になる', () => {
    const world = createPhysicsWorld();
    world.addFruit(0, 240, DROP_Y);

    advance(world, 5000);

    const [snapshot] = world.snapshot();
    expect(snapshot?.isSleeping).toBe(true);
    world.dispose();
  });

  it('[R-05] 果物を追加すると既存の sleeping 果物が起きる', () => {
    const world = createPhysicsWorld();
    world.addFruit(0, 240, DROP_Y);
    advance(world, 5000);
    expect(world.snapshot()[0]?.isSleeping).toBe(true);

    world.addFruit(0, 240, DROP_Y);

    expect(world.snapshot().every((fruit) => !fruit.isSleeping)).toBe(true);
    world.dispose();
  });

  it('[R-E] 追加直後の果物は landed = false で、床に触れると landed = true になる', () => {
    const world = createPhysicsWorld();
    const fruit = world.addFruit(0, 240, DROP_Y);

    expect(fruit.landed).toBe(false);
    expect(world.snapshot()[0]?.landed).toBe(false);

    advance(world, 3000);

    // 落ちて床（果物ではない静的ボディ）に触れたので着地済み
    expect(world.snapshot()[0]?.landed).toBe(true);
    world.dispose();
  });

  it('[R-E / E-12] landed: true を指定した果物は最初から着地済み（合体で生成した果物）', () => {
    const world = createPhysicsWorld();
    const fruit = world.addFruit(0, 240, DROP_Y, { landed: true });

    expect(fruit.landed).toBe(true);
    expect(world.snapshot()[0]?.landed).toBe(true);
    world.dispose();
  });

  it('[R-E] 果物どうしの接触でも landed = true になる', () => {
    const world = createPhysicsWorld();
    const radius = FRUITS[1]?.radius ?? 0;
    world.addFruit(1, 240, CONTAINER_FLOOR_Y - radius - 5);
    advance(world, 1000);
    const falling = world.addFruit(1, 240, CONTAINER_FLOOR_Y - radius * 4);

    expect(falling.landed).toBe(false);
    advance(world, 2000);

    expect(world.snapshot().every((snapshot) => snapshot.landed)).toBe(true);
    world.dispose();
  });

  it('果物どうしの衝突だけを onFruitContact に通知する（壁・床との衝突は通知しない）', () => {
    const world = createPhysicsWorld();
    const contacts: FruitContact[] = [];
    const unsubscribe = world.onFruitContact((contact) => contacts.push(contact));

    // 床に接地させる（この衝突は通知されない）
    const radius = FRUITS[1]?.radius ?? 0;
    world.addFruit(1, 240, CONTAINER_FLOOR_Y - radius - 5);
    advance(world, 1000);
    expect(contacts).toHaveLength(0);

    // 真上から落として果物どうしを衝突させる
    world.addFruit(1, 240, CONTAINER_FLOOR_Y - radius * 4);
    advance(world, 2000);

    expect(contacts.length).toBeGreaterThan(0);
    const [first] = contacts;
    expect(first?.a.tier).toBe(1);
    expect(first?.b.tier).toBe(1);
    expect(first?.a.fruitId).not.toBe(first?.b.fruitId);

    unsubscribe();
    const seen = contacts.length;
    world.addFruit(1, 240, CONTAINER_FLOOR_Y - radius * 6);
    advance(world, 2000);
    expect(contacts).toHaveLength(seen);
    world.dispose();
  });

  it('[R-05] 既存の果物と重なる位置に追加した果物も接触として通知される', () => {
    const world = createPhysicsWorld();
    const contacts: FruitContact[] = [];
    world.onFruitContact((contact) => contacts.push(contact));
    const radius = FRUITS[2]?.radius ?? 0;

    // 静止して sleeping に入った果物を用意する（合体漏れが起きやすい状態）
    world.addFruit(2, 240, CONTAINER_FLOOR_Y - radius);
    advance(world, 5000);
    expect(world.snapshot()[0]?.isSleeping).toBe(true);
    contacts.length = 0;

    // 合体で生まれた果物が既存の果物と重なって出現する状況を再現する
    world.addFruit(2, 240 + radius, CONTAINER_FLOOR_Y - radius);
    advance(world, PHYSICS_TIMESTEP_MS * SPAWN_ACTIVE_CONTACT_STEPS);

    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.every((contact) => contact.a.tier === 2 && contact.b.tier === 2)).toBe(true);
    world.dispose();
  });

  it('[NFR-01] 接触継続の通知は生成直後の窓で打ち切り、毎ステップ積み上げない', () => {
    const world = createPhysicsWorld();
    const contacts: FruitContact[] = [];
    world.onFruitContact((contact) => contacts.push(contact));
    const radius = FRUITS[2]?.radius ?? 0;

    // 触れ合った状態で置き、猶予窓を使い切らせる
    world.addFruit(2, 240 - radius, CONTAINER_FLOOR_Y - radius);
    world.addFruit(2, 240 + radius, CONTAINER_FLOOR_Y - radius);
    advance(world, PHYSICS_TIMESTEP_MS * SPAWN_ACTIVE_CONTACT_STEPS);
    const afterGrace = contacts.length;

    /*
     * 窓が閉じていなければ接触継続がステップ数だけ積み上がる（この区間で 300 件規模になる）。
     * 桁で差が出るため、余裕を持った上限で「積み上がっていない」ことを押さえる。
     */
    const settleSteps = 300;
    advance(world, PHYSICS_TIMESTEP_MS * settleSteps);
    expect(contacts.length - afterGrace).toBeLessThan(settleSteps / 10);
    world.dispose();
  });

  it('removeFruit / clearFruits で果物が世界から消える', () => {
    const world = createPhysicsWorld();
    const fruit = world.addFruit(0, 240, DROP_Y);
    world.addFruit(1, 260, DROP_Y);

    world.removeFruit(fruit.fruitId);
    expect(world.fruitCount()).toBe(1);
    // 存在しない ID は無視する
    world.removeFruit(fruit.fruitId);
    expect(world.fruitCount()).toBe(1);

    world.clearFruits();
    expect(world.fruitCount()).toBe(0);
    expect(world.snapshot()).toEqual([]);
    world.dispose();
  });

  it('step は固定タイムステップで進み、1 フレームの上限を超えない', () => {
    const world = createPhysicsWorld();

    // タイムステップ未満は 1 ステップも進めず、端数を持ち越す
    expect(world.step(PHYSICS_TIMESTEP_MS / 2)).toBe(0);
    expect(world.step(PHYSICS_TIMESTEP_MS / 2)).toBe(1);

    // 巨大な delta（タブ復帰直後など）でも上限で打ち切る
    expect(world.step(10_000)).toBe(MAX_PHYSICS_STEPS_PER_FRAME);
    // 打ち切った端数は捨てるので、次のフレームは通常どおり 1 ステップ
    expect(world.step(PHYSICS_TIMESTEP_MS)).toBe(1);

    // 不正な delta は無視する
    expect(world.step(0)).toBe(0);
    expect(world.step(-100)).toBe(0);
    expect(world.step(Number.NaN)).toBe(0);
    world.dispose();
  });

  it('dispose 後の操作は例外になる', () => {
    const world = createPhysicsWorld();
    world.dispose();
    expect(() => world.addFruit(0, 240, DROP_Y)).toThrow(/dispose/);
    // dispose は冪等
    expect(() => world.dispose()).not.toThrow();
  });
});
