/**
 * Matter.js のラッパ（FR-02）。
 *
 * 契約点: docs/internal/architecture/suika-game-structure.md §5（定数）
 * ここが Matter.js への依存を閉じ込める唯一の場所。ゲームロジック側（game.ts / merge.ts / gameover.ts）は
 * 本モジュールが返す **プレーンな値**（{@link FruitSnapshot} / {@link FruitContact}）だけを見る（NFR-05）。
 *
 * 座標はすべて論理座標系（480×720、y は下方向が正）。描画のスケーリングは renderer.ts の責務。
 */

import { Bodies, Composite, Engine, Events, Sleeping } from 'matter-js';
import type { Body, Engine as MatterEngine, IEventCollision } from 'matter-js';

import {
  CONTAINER_FLOOR_Y,
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  ENABLE_SLEEPING,
  FRICTION,
  FRUIT_DENSITY,
  FRUIT_FRICTION_AIR,
  FRUIT_FRICTION_STATIC,
  GRAVITY_Y,
  MAX_PHYSICS_STEPS_PER_FRAME,
  PHYSICS_TIMESTEP_MS,
  RESTITUTION,
  SPAWN_ACTIVE_CONTACT_STEPS,
  WALL_FRICTION,
  WALL_THICKNESS,
  WALL_TOP_Y,
} from './constants';
import { FRUITS } from './fruits';
import type { FruitTier } from './types';

/**
 * 果物の剛体。Matter.js の `Body` に果物としての識別情報を持たせたもの。
 *
 * `fruitId` は「同じ tier の別個体」を区別するための一意な ID。合体（#7）で
 * 「衝突した 2 個のうちどちらを消してどちらを昇格させるか」「同じペアを二重に処理しないか」を
 * 判定するのに使うため、`Body.id` ではなく本モジュールが払い出す値を持たせる
 * （Matter.js の `Body.id` は削除後に再利用される可能性があり、外部キーとして使えない）。
 */
export interface FruitBody extends Body {
  readonly fruitId: number;
  readonly tier: FruitTier;
}

/** 果物 1 個の状態のスナップショット（描画・判定用。Matter.js に依存しない値） */
export interface FruitSnapshot {
  fruitId: number;
  tier: FruitTier;
  x: number;
  y: number;
  /** 論理座標系での半径 (px) */
  radius: number;
  /** ラジアン。転がりを描画に反映するために持つ */
  angle: number;
  /** スリープ中か（R-05 の確認用。HUD / デバッグ表示にも使う） */
  isSleeping: boolean;
}

/**
 * 衝突した果物 2 個の組（合体判定に必要な情報だけを渡す）。合体解決（game.ts）が購読する。
 *
 * 通知の元になるのは接触開始（`collisionStart`）と、**生成直後の果物**に限った接触継続
 * （`collisionActive`。R-05 対策）の 2 経路。そのため同じ組が 1 フレームに複数回届きうる。
 * 重複の吸収は購読側の畳み込み（`resolveMergeBatch`。R-D の `consumed`）が担う。
 */
export interface FruitContact {
  a: FruitSnapshot;
  b: FruitSnapshot;
}

/** 購読解除する関数 */
export type Unsubscribe = () => void;

export interface PhysicsWorld {
  /**
   * 果物を 1 個追加する。
   *
   * @param tier 果物の段階（半径・見た目は {@link FRUITS} 由来）
   * @param x 論理座標系の中心 x
   * @param y 論理座標系の中心 y
   * @returns 追加した剛体（`fruitId` の払い出し済み）
   */
  addFruit(tier: FruitTier, x: number, y: number): FruitBody;
  /** 果物を 1 個取り除く（合体で消滅させる #7 が使う）。存在しない ID は無視する */
  removeFruit(fruitId: number): void;
  /** 現在の果物すべてのスナップショット（配列は毎回新規。呼び出し側が保持してよい） */
  snapshot(): FruitSnapshot[];
  /** 果物の個数（スナップショットを作らずに数えたいとき用） */
  fruitCount(): number;
  /**
   * 物理を `deltaMs` 分進める。固定タイムステップ（{@link PHYSICS_TIMESTEP_MS}）の
   * 積み上げで進め、端数は次回に持ち越す。
   *
   * @returns 実際に実行したステップ数（0 なら世界は変化していない）
   */
  step(deltaMs: number): number;
  /** 果物どうしの衝突開始を購読する（#7 の合体判定が使う） */
  onFruitContact(handler: (contact: FruitContact) => void): Unsubscribe;
  /** すべての果物を取り除く（リスタート用。壁・床は残す） */
  clearFruits(): void;
  /** リスナ・剛体をすべて破棄する。以降は使えない */
  dispose(): void;
}

/** `Body` が果物かどうか（壁・床と区別する） */
function isFruitBody(body: Body): body is FruitBody {
  return typeof (body as Partial<FruitBody>).fruitId === 'number';
}

function toSnapshot(body: FruitBody): FruitSnapshot {
  return {
    fruitId: body.fruitId,
    tier: body.tier,
    x: body.position.x,
    y: body.position.y,
    radius: body.circleRadius ?? 0,
    angle: body.angle,
    isSleeping: body.isSleeping,
  };
}

/** 静的な壁・床。左右の壁はデッドラインより上まで伸ばし、天井は作らない */
function createContainerBodies(): Body[] {
  const wallHeight = CONTAINER_FLOOR_Y + WALL_THICKNESS - WALL_TOP_Y;
  const wallCenterY = WALL_TOP_Y + wallHeight / 2;
  const floorWidth = CONTAINER_RIGHT - CONTAINER_LEFT + WALL_THICKNESS * 2;
  const options = { isStatic: true, friction: WALL_FRICTION, restitution: RESTITUTION };

  return [
    // 左壁: 内側の面が CONTAINER_LEFT に一致するよう、厚みの半分だけ外へずらす
    Bodies.rectangle(
      CONTAINER_LEFT - WALL_THICKNESS / 2,
      wallCenterY,
      WALL_THICKNESS,
      wallHeight,
      options,
    ),
    // 右壁: 同様に内側の面を CONTAINER_RIGHT に合わせる
    Bodies.rectangle(
      CONTAINER_RIGHT + WALL_THICKNESS / 2,
      wallCenterY,
      WALL_THICKNESS,
      wallHeight,
      options,
    ),
    // 床: 上面が CONTAINER_FLOOR_Y。壁の外側まで伸ばして角の隙間を作らない
    Bodies.rectangle(
      (CONTAINER_LEFT + CONTAINER_RIGHT) / 2,
      CONTAINER_FLOOR_Y + WALL_THICKNESS / 2,
      floorWidth,
      WALL_THICKNESS,
      options,
    ),
  ];
}

/**
 * 物理世界を生成する。
 *
 * `enableSleeping: true`（NFR-01 / R-05）により、静止した果物は計算対象から外れる。
 * 果物を追加したときは、下で支えている果物が寝たままにならないよう明示的に起こす。
 */
export function createPhysicsWorld(): PhysicsWorld {
  const engine: MatterEngine = Engine.create({ enableSleeping: ENABLE_SLEEPING });
  engine.gravity.y = GRAVITY_Y;

  Composite.add(engine.world, createContainerBodies());

  const fruits = new Map<number, FruitBody>();
  const contactHandlers = new Set<(contact: FruitContact) => void>();
  /**
   * 生成直後の果物の `fruitId` → 接触継続も通知する残りステップ数（R-05）。
   * `step` のたびに減らし、0 になったら外す。
   */
  const spawnGrace = new Map<number, number>();
  let nextFruitId = 1;
  /** 固定ステップに満たなかった時間の持ち越し (ms) */
  let carryOverMs = 0;
  let disposed = false;

  /**
   * 衝突ペア列から果物どうしの組だけを拾って通知する。
   *
   * @param includePair 通知対象を絞る述語（接触開始は全件、接触継続は生成直後の果物を含む組だけ）
   */
  const notifyContacts = (
    event: IEventCollision<MatterEngine>,
    includePair: (a: FruitBody, b: FruitBody) => boolean,
  ): void => {
    if (contactHandlers.size === 0) {
      return;
    }
    for (const pair of event.pairs) {
      // 壁・床との衝突は合体に関係しないので落とす
      if (!isFruitBody(pair.bodyA) || !isFruitBody(pair.bodyB)) {
        continue;
      }
      if (!includePair(pair.bodyA, pair.bodyB)) {
        continue;
      }
      /*
       * 購読側が同じフレーム内で片方を削除しうるため、
       * ハンドラ呼び出し前にスナップショット（値）へ変換して渡す。
       */
      const contact: FruitContact = { a: toSnapshot(pair.bodyA), b: toSnapshot(pair.bodyB) };
      for (const handler of contactHandlers) {
        handler(contact);
      }
    }
  };

  const handleCollisionStart = (event: IEventCollision<MatterEngine>): void => {
    notifyContacts(event, () => true);
  };

  /**
   * 生成直後の果物を含む接触継続だけを通知する（R-05）。
   * 合体で生まれた果物が既存の果物と重なって出現したケースを取りこぼさないための保険。
   */
  const handleCollisionActive = (event: IEventCollision<MatterEngine>): void => {
    if (spawnGrace.size === 0) {
      return;
    }
    notifyContacts(event, (a, b) => spawnGrace.has(a.fruitId) || spawnGrace.has(b.fruitId));
  };

  Events.on(engine, 'collisionStart', handleCollisionStart);
  Events.on(engine, 'collisionActive', handleCollisionActive);

  /** 生成直後の猶予ステップを 1 つ消費する（`Engine.update` 1 回ごとに呼ぶ） */
  const consumeSpawnGrace = (): void => {
    for (const [fruitId, remaining] of spawnGrace) {
      if (remaining <= 1) {
        spawnGrace.delete(fruitId);
      } else {
        spawnGrace.set(fruitId, remaining - 1);
      }
    }
  };

  const assertUsable = (): void => {
    if (disposed) {
      throw new Error('PhysicsWorld は dispose 済みです');
    }
  };

  return {
    addFruit(tier, x, y) {
      assertUsable();
      const def = FRUITS[tier];
      if (def === undefined) {
        // FruitTier は 0〜10 に閉じているため通常到達しない（外部入力由来の値に対する保険）
        throw new RangeError(`addFruit: 未定義の tier です（受け取った値: ${tier}）`);
      }
      const body = Bodies.circle(x, y, def.radius, {
        label: `fruit-${tier}`,
        density: FRUIT_DENSITY,
        restitution: RESTITUTION,
        friction: FRICTION,
        frictionAir: FRUIT_FRICTION_AIR,
        frictionStatic: FRUIT_FRICTION_STATIC,
      });

      const fruit: FruitBody = Object.assign(body, { fruitId: nextFruitId++, tier });
      fruits.set(fruit.fruitId, fruit);
      spawnGrace.set(fruit.fruitId, SPAWN_ACTIVE_CONTACT_STEPS);
      Composite.add(engine.world, fruit);

      /*
       * 新しい果物が落ちてくる先の果物が sleeping のままだと、当たっても反応しないフレームが出る。
       * Matter.js は衝突時に起こしてくれるが、生成直後の 1 フレームだけ挙動が鈍るため、
       * 落下経路に関係なく既存の果物を起こしておく（NFR-01 の観点では、
       * 直後に再び寝るので定常状態のコストは変わらない）。
       */
      for (const other of fruits.values()) {
        if (other !== fruit && other.isSleeping) {
          Sleeping.set(other, false);
        }
      }
      return fruit;
    },

    removeFruit(fruitId) {
      assertUsable();
      const fruit = fruits.get(fruitId);
      if (fruit === undefined) {
        return;
      }
      fruits.delete(fruitId);
      spawnGrace.delete(fruitId);
      Composite.remove(engine.world, fruit);
    },

    snapshot() {
      const list: FruitSnapshot[] = [];
      for (const fruit of fruits.values()) {
        list.push(toSnapshot(fruit));
      }
      return list;
    },

    fruitCount() {
      return fruits.size;
    },

    step(deltaMs) {
      assertUsable();
      if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
        return 0;
      }
      carryOverMs += deltaMs;
      let steps = 0;
      while (carryOverMs >= PHYSICS_TIMESTEP_MS && steps < MAX_PHYSICS_STEPS_PER_FRAME) {
        Engine.update(engine, PHYSICS_TIMESTEP_MS);
        consumeSpawnGrace();
        carryOverMs -= PHYSICS_TIMESTEP_MS;
        steps += 1;
      }
      if (carryOverMs >= PHYSICS_TIMESTEP_MS) {
        // 追いつけなかった分は捨てる（溜め込むと以降のフレームが恒久的に重くなる）
        carryOverMs = 0;
      }
      return steps;
    },

    onFruitContact(handler) {
      contactHandlers.add(handler);
      return () => contactHandlers.delete(handler);
    },

    clearFruits() {
      assertUsable();
      for (const fruit of fruits.values()) {
        Composite.remove(engine.world, fruit);
      }
      fruits.clear();
      spawnGrace.clear();
      carryOverMs = 0;
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      Events.off(engine, 'collisionStart', handleCollisionStart);
      Events.off(engine, 'collisionActive', handleCollisionActive);
      contactHandlers.clear();
      fruits.clear();
      spawnGrace.clear();
      Engine.clear(engine);
      Composite.clear(engine.world, false, true);
    },
  };
}
