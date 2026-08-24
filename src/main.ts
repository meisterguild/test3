/**
 * エントリポイント。
 *
 * 基盤構築（T-01）の範囲は「空の canvas が表示されるところまで」。
 * 物理・描画・ゲームループの初期化（`src/game/game.ts` の生成と起動）は T-04 でここに繋ぐ。
 * 契約点: docs/internal/architecture/suika-game-structure.md §2
 */

function requireCanvas(): HTMLCanvasElement {
  // 契約点 §9: DOM 要素の取得は data-testid で行う
  const el = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
  if (el === null) {
    throw new Error('game-canvas が見つかりません（index.html の data-testid を確認してください）');
  }
  return el;
}

/** 盤面がまだ空であることが分かる程度の下地だけを描く（T-04 で renderer.ts に置き換える） */
function paintPlaceholder(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    // Canvas 2D が使えない環境（NFR-02 の対象外ブラウザ）。ゲーム自体は成立しないが
    // 例外で真っ白にはせず、以降の issue で扱えるようログだけ残す。
    console.error('Canvas 2D コンテキストを取得できませんでした');
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

paintPlaceholder(requireCanvas());
