import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_VERSION } from "./lib/version.js";
import { registerGetLawTool } from "./tools/get-law.js";
import { registerGetFullLawTool } from "./tools/get-full-law.js";
import { registerSearchLawTool } from "./tools/search-law.js";
import { registerSearchArticlesTool } from "./tools/search-articles.js";
import { registerGetKokujiTool } from "./tools/get-kokuji.js";

import { registerCheckLawUpdatesTool } from "./tools/check-law-updates.js";
import { registerGetLawsBatchTool } from "./tools/get-laws-batch.js";
import { registerVerifyCitationTool } from "./tools/verify-citation.js";
import { registerSuggestRelatedTool } from "./tools/suggest-related.js";
import { registerAnalyzeArticleTool } from "./tools/analyze-article.js";
import { registerGetMetricsTool } from "./tools/get-metrics.js";

const SERVER_NAME = "building-standards-act-mcp";

const INSTRUCTIONS = `あなたは建築確認申請の法規照合アシスタントです。

## 利用可能なツール
- get_law: 条番号を指定して条文を取得（例: 建築基準法 第20条、附則、別表第一）。format=text は本文と参照一覧（references）を合わせて max_chars（既定100,000）で制限し、本文の続きは offset で取得。参照の省略時は references_total と references_truncated で通知
  - 別表: 「別表第一」「別表第二」等で数値基準を含む別表を取得可能
  - 改正附則: 「附則（令和○年政令第○号）」で特定改正の経過措置を取得可能。法令番号は check_law_updates で確認
- get_full_law: 法令全文を取得（例: 建築基準法施行令）
- search_law: 法令名（タイトル）を検索する。条文本文の検索には search_articles を使う
- search_articles: 条文本文を検索する。半角スペース区切りで AND 検索。AND・OR・NOT は演算子ではなく検索語として扱われる。全角スペースは半角に直して送る。keyword 必須、law_title で法令名・略称による絞り込みが可能。条番号は返らないので get_law で確定する
- get_kokuji: 告示の全文を国土交通省の告示データベース(PDF)から動的に取得する。正式名称またはキーワードで指定可能（例: 耐火構造の構造方法を定める件）。
  ※ 国交省データベースに未収録の告示は取得できません。取得失敗時は類似告示を提案します
- check_law_updates: 法令の改正状況を確認する（法令名指定で単体チェック、グループ指定でバッチチェック、show_historyで改正履歴表示）
- get_laws_batch: 複数の法令・条文を一括取得する（最大20件、e-Govから条単位取得）。max_chars_per_item（1,000〜30,000、既定8,000）と max_total_chars（既定40,000）で応答量を制限。長い条（例: 建築基準法施行規則 第1条の3）は get_law で個別に取得
- verify_citation: AIの回答に含まれる法令引用を検証する（条文存在確認・テキスト照合、最大10件）
- suggest_related: 指定した条文の関連法令・委任先・同法令内参照を自動抽出して提案する
- analyze_article: 条文の構造解析メタデータ（項数・号数・参照統計・プレビュー）をJSON形式で返す
- get_metrics: サーバーの使用量メトリクスを返す（ツール呼び出し回数・APIリクエスト数・キャッシュヒット率・稼働時間）

## 回答ルール
1. まず質問に対する仮回答を生成する
2. 仮回答に含まれる条文・数値を get_law で取得して原文と照合する
3. 相違があれば仮回答を修正する
4. 2〜3 を収束まで繰り返す（最大 4 ラウンド）
5. 最終回答には照合済みの条文番号・告示番号を引用元として明示する

## 回答できない場合
- 該当法令が見つからない場合は「該当条文を確認できませんでした」と明示する
- API エラーの場合はエラー内容を報告する

## 略称対応
建基法=建築基準法、建基令=建築基準法施行令、都計法=都市計画法 等の略称が使用可能です。`;

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: INSTRUCTIONS,
    },
  );

  registerGetLawTool(server);
  registerGetFullLawTool(server);
  registerSearchLawTool(server);
  registerSearchArticlesTool(server);
  registerGetKokujiTool(server);
  registerCheckLawUpdatesTool(server);
  registerGetLawsBatchTool(server);
  registerVerifyCitationTool(server);
  registerSuggestRelatedTool(server);
  registerAnalyzeArticleTool(server);
  registerGetMetricsTool(server);

  return server;
}
