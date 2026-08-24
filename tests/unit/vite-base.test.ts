import { describe, expect, it } from 'vitest';

import { normalizeBase } from '../../vite.config';

/**
 * 公開先サブパスの正規化（NFR-03 / GitHub Pages デプロイ）を固定する。
 *
 * `base` を間違えると公開 URL 上で JS / CSS / 音源が丸ごと 404 になるが、
 * それが分かるのはデプロイ後なので、入力パターンをここで潰しておく。
 * 入力元は `.github/workflows/pages.yml` が渡す `actions/configure-pages` の
 * `base_path`（プロジェクトサイト = `/test3`、ユーザ / Org サイト = 空文字）と、
 * 手元で `SUIKA_BASE` を明示するケース。
 */
describe('normalizeBase', () => {
  it('未設定・空文字はローカル既定のルート配信 `/` になる', () => {
    expect(normalizeBase(undefined)).toBe('/');
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('   ')).toBe('/');
    expect(normalizeBase('/')).toBe('/');
  });

  it('末尾スラッシュの有無にかかわらず `/<repo>/` へ揃える', () => {
    // configure-pages の base_path は末尾スラッシュなしで来る
    expect(normalizeBase('/test3')).toBe('/test3/');
    expect(normalizeBase('/test3/')).toBe('/test3/');
    // 手書きでスラッシュを落とした場合も救う
    expect(normalizeBase('test3')).toBe('/test3/');
  });

  it('多段のサブパスと余分なスラッシュを畳む', () => {
    expect(normalizeBase('//test3//')).toBe('/test3/');
    expect(normalizeBase('games/suika')).toBe('/games/suika/');
  });
});
