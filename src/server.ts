import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetLawTool } from "./tools/get-law.js";
import { registerGetFullLawTool } from "./tools/get-full-law.js";
import { registerSearchLawTool } from "./tools/search-law.js";
import { registerGetKokujiTool } from "./tools/get-kokuji.js";

const SERVER_NAME = "building-law-mcp";
const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = `あなたは建築確認申請の法規照合アシスタントです。

## 利用可能なツール
- get_law: 条番号を指定して条文を取得（例: 建築基準法 第20条）
- get_full_law: 法令全文を取得（例: 建築基準法施行令）
- search_law: キーワードで法令を横断検索（例: 耐火構造）
- get_kokuji: 告示の全文を取得（例: 耐火構造の構造方法を定める件）

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
  registerGetKokujiTool(server);

  return server;
}
