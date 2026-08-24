import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * ESLint flat config。対象はこのリポジトリのメタ層で開発しているスイカゲームのソースのみ。
 * `template/` 配下（プロジェクトへコピーされるペイロード）は lint 対象外にする。
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'template/**',
      '.auto-pr-loop/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      // console は開発時の一時デバッグに限る。error / warn は残せるようにする
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      /*
       * tsconfig.json は設定ファイル（vite / playwright）のために node 型を読み込んでいる。
       * ブラウザで動く src/** から Node のグローバルを参照すると実行時に落ちるため、
       * 型ではなく lint 側で禁止する。
       */
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'ブラウザ側コードから Node のグローバルは参照しない' },
        { name: 'global', message: 'ブラウザ側コードから Node のグローバルは参照しない' },
        { name: '__dirname', message: 'ブラウザ側コードから Node のグローバルは参照しない' },
        { name: 'require', message: 'ESM を使う（CommonJS の require は使わない）' },
      ],
    },
  },
  // Prettier と競合するフォーマット系ルールを最後に無効化する
  prettier,
);
