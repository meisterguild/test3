/**
 * 盤面・物理・タイミング定数。
 *
 * 真理ソース: 契約点 docs/internal/architecture/suika-game-structure.md §5
 * **物理・盤面のパラメータはこのファイル 1 箇所に集約する**（R-02）。
 * 他モジュールに数値リテラルを直接書かない（プレイフィール調整をここだけで完結させるため）。
 *
 * 座標系は論理座標系 480×720 で、**y は下方向が正**（canvas 慣習）。
 * 実際の canvas の解像度は CSS サイズ × `devicePixelRatio` へスケールする（R-04 / renderer.ts）。
 */

/** 論理座標系の幅 */
export const STAGE_WIDTH = 480;

/** 論理座標系の高さ */
export const STAGE_HEIGHT = 720;

/** 壁・床の厚み */
export const WALL_THICKNESS = 20;

/** 容器内側の左端 x */
export const CONTAINER_LEFT = 40;

/** 容器内側の右端 x（内幅 400） */
export const CONTAINER_RIGHT = 440;

/** 容器内側の床の y */
export const CONTAINER_FLOOR_Y = 690;

/** デッドラインの y（これより上に留まると NG。判定は #9 / gameover.ts） */
export const DEADLINE_Y = 120;

/** ドロップ待機中の果物の y */
export const DROP_Y = 60;

/** 次のドロップを受け付けない時間（FR-10。入力側の実装は input.ts） */
export const DROP_COOLDOWN_MS = 500;

/** デッドライン超過が継続してよい時間（FR-07 / R-03。判定は #9） */
export const GAMEOVER_GRACE_MS = 1500;

/** Matter.js の重力 y */
export const GRAVITY_Y = 1.0;

/** 反発係数 */
export const RESTITUTION = 0.15;

/** 摩擦係数 */
export const FRICTION = 0.3;

/** 静止果物のスリープ（NFR-01 / R-05） */
export const ENABLE_SLEEPING = true;

/*
 * ここから下は契約点 §5 の表に無い「実装で必要になった調整値」。
 * 物理・盤面のパラメータを 1 ファイルに集約する規約（R-02）に従い、
 * renderer / physics 側に散らさずここへ置く。
 */

/**
 * 物理演算の固定タイムステップ (ms)。
 *
 * 可変 delta をそのまま `Engine.update` に渡すと、フレーム落ち時に貫通（トンネリング）や
 * 挙動の非決定性が出るため、固定ステップの積み上げで進める（physics.ts の `step`）。
 */
export const PHYSICS_TIMESTEP_MS = 1000 / 60;

/**
 * 1 フレームで消化する物理ステップ数の上限。
 *
 * タブ復帰直後などに巨大な delta が来たとき、追いつこうとして
 * 1 フレームに数百ステップ回す（＝更に固まる）のを防ぐ。超過分は捨てる（時間を進めない）。
 */
export const MAX_PHYSICS_STEPS_PER_FRAME = 5;

/**
 * 果物どうしの密度。Matter.js の既定値 (0.001) をそのまま使うと大玉が軽すぎて
 * 積み上がりが不安定になるため、定数として明示して調整対象にする。
 */
export const FRUIT_DENSITY = 0.001;

/**
 * 果物の空気抵抗（`frictionAir`）。既定 0.01 では横方向の滑りが止まらず、
 * スリープ（R-05）に入りにくいため、わずかに強めて減衰させる。
 */
export const FRUIT_FRICTION_AIR = 0.02;

/** 果物どうしの静止摩擦。転がり続けて sleeping に入らないのを防ぐ */
export const FRUIT_FRICTION_STATIC = 0.5;

/** 壁・床の摩擦（果物どうしより高め。容器際で果物が滑り落ちないようにする） */
export const WALL_FRICTION = 0.5;

/**
 * フレームレート実測の平均窓 (ms)。短すぎると値が暴れ、長すぎると
 * 一時的なコマ落ち（NFR-01 で見たいもの）が平均に埋もれるため 0.5 秒に置く。
 */
export const FPS_SAMPLE_WINDOW_MS = 500;

/**
 * 壁の上端 y。容器の外へ弾き出されないよう、デッドラインより上まで壁を伸ばす。
 * 天井は作らない（積み上がった果物がはみ出すこと自体は #9 のゲームオーバー判定で扱う）。
 */
export const WALL_TOP_Y = 0;

/**
 * 矢印キー 1 回で狙いが動く距離（論理座標 px。FR-01 のキーボード操作）。
 *
 * 容器の内幅 400px を端から端まで 20 回で移動できる幅。小さすぎるとキーリピート前提の
 * 操作になり、大きすぎると細かい位置合わせができない。
 */
export const AIM_KEY_STEP = 20;
