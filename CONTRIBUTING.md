# Contributing

building-standards-act-mcp へのコントリビューションを歓迎します。

## 開発環境のセットアップ

```bash
git clone https://github.com/Sora-bluesky/building-standards-act-mcp.git
cd building-standards-act-mcp
npm install
```

## 開発コマンド

| コマンド             | 説明                    |
| -------------------- | ----------------------- |
| `npm run dev`        | 開発サーバー起動（tsx） |
| `npm run build`      | TypeScript ビルド       |
| `npm test`           | テスト実行（vitest）    |
| `npm run test:watch` | テスト監視モード        |

## コーディング規約

- TypeScript strict mode
- 変数名・関数名・コメントは英語
- ユーザー向けドキュメントは日本語可

## テスト

変更を加えたら、必ずテストを実行してください。

```bash
npm test
```

- 新しい機能にはテストを追加してください
- カバレッジ目標: 80% 以上

### テストの種類

- **ユニットテスト**: `tests/` 直下
- **統合テスト**: `tests/integration/`

## 法令プリセットの追加

新しい法令を追加する場合:

1. [e-Gov 法令検索](https://laws.e-gov.go.jp/) で law_id を確認
2. `src/lib/law-registry.ts` にエントリを追加
3. `scripts/verified-law-ids.json` に law_id を追加
4. テストを追加して `npm test` で確認

## Pull Request

1. feature ブランチを作成してください
2. 変更をコミットしてください
3. テストが通ることを確認してください
4. Pull Request を作成してください

## ライセンス

コントリビューションは [MIT License](LICENSE) のもとで提供されます。
