/**
 * エントリポイント。
 *
 * 基盤構築（T-01）の範囲は「空の canvas が表示されるところまで」。
 * 物理・描画・ゲームループの初期化（`src/game/game.ts` の生成と起動）は T-04 でここに繋ぐ。
 * 契約点: docs/internal/architecture/suika-game-structure.md §2
 */

export function requireCanvas(): HTMLCanvasElement {
  // 契約点 §9: DOM 要素の取得は data-testid で行う
  const el = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
  if (el === null) {
    throw new Error('game-canvas が見つかりません（index.html の data-testid を確認してください）');
  }
  return el;
}

/**
 * 描画に必要な 2D コンテキストを取得する。
 * 取得できない環境（NFR-02 の対象外ブラウザ）ではゲームが成立しないので、
 * canvas 不在と同じ「描画不能」として例外で扱う（扱いを 1 つに揃える）。
 */
export function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Canvas 2D コンテキストを取得できませんでした');
  }
  return ctx;
}

/**
 * 起動処理。基盤構築（T-01）の範囲では canvas と 2D コンテキストが揃うことの確認だけを行う。
 * 描画不能なら理由をユーザーにも見える形で出す（無言の空白画面にしない）。
 *
 * 文言は原因を断定しない。canvas 要素の欠落（マークアップ / ビルド不具合）と
 * コンテキスト取得失敗（対象外ブラウザ）のどちらもここに来るため、
 * 原因の特定は console のログに委ねる。
 */
export function bootstrap(): void {
  try {
    // 戻り値は T-04 で renderer.ts / game.ts へ渡す。現時点は取得可否の確認のみ。
    const ctx = requireContext(requireCanvas());
    void ctx;
  } catch (error) {
    console.error('ゲームの初期化に失敗しました', error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent =
      'ゲームを表示できませんでした。詳細はブラウザのコンソールを確認してください。';
    document.body.appendChild(message);
  }
}

bootstrap();
