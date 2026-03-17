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

## ブランチ戦略

`main` ブランチを唯一の安定ブランチとして運用します。

### フロー

```
1. main から feature ブランチを作成
   git checkout -b feat/my-feature

2. 変更をコミット
   git add <files>
   git commit -m "feat: add my feature"

3. push して PR を作成
   git push -u origin feat/my-feature
   gh pr create

4. CI が自動実行（build → lint → test → MCP protocol test）

5. CI パス後にマージ → feature ブランチ自動削除
```

### ブランチ命名規則

| プレフィックス | 用途             |
| -------------- | ---------------- |
| `feat/`        | 新機能           |
| `fix/`         | バグ修正         |
| `docs/`        | ドキュメント     |
| `chore/`       | ビルド・設定変更 |
| `refactor/`    | リファクタリング |

### CI チェック

PR に対して以下が自動実行されます:

- **lint**: TypeScript 型チェック（`tsc --noEmit`）
- **build**: TypeScript ビルド
- **test**: vitest による全テスト実行
- **MCP protocol test**: サーバー起動 + JSON-RPC 応答確認
- **マトリクス**: macOS + Ubuntu, Node.js 18/20/22（6 ジョブ）

## Pull Request

1. feature ブランチを作成してください
2. 変更をコミットしてください
3. テストが通ることを確認してください
4. Pull Request を作成してください

## ライセンス

コントリビューションは [MIT License](LICENSE) のもとで提供されます。
