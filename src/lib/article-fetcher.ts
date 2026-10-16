import {
  getLawArticle,
  getLawData,
  getLawDataByRevision,
  getLawRevisions,
} from "./egov-client.js";
import {
  detectSpecialSection,
  findAmendmentSupplProvision,
  getSupplProvisionArticleNumbers,
  matchAmendLawNum,
  parseArticle,
  parseArticleStructured,
  toArticleElm,
} from "./egov-parser.js";
import { ArticleNotFoundError } from "./errors.js";
import type {
  EgovLawDataResponse,
  EgovRevisionInfo,
  ParsedArticle,
  StructuredArticle,
} from "./types.js";

export interface FetchedArticle<T> {
  article: T;
  revision?: Pick<
    EgovRevisionInfo,
    "law_revision_id" | "amendment_enforcement_date" | "current_revision_status"
  >;
  revisionNote?: string;
}

/** Choose the smallest API response that can satisfy the request. */
export async function fetchArticleData(
  lawId: string,
  articleNumber: string,
): Promise<EgovLawDataResponse | null> {
  const elm = toArticleElm(articleNumber);
  return elm !== null ? await getLawArticle(lawId, elm) : await getLawData(lawId);
}

/** Resolve amendment supplements against a matching revision only after a miss. */
export function fetchParsedArticle(
  lawId: string,
  articleNumber: string,
  format?: "text",
): Promise<FetchedArticle<ParsedArticle> | null>;
export function fetchParsedArticle(
  lawId: string,
  articleNumber: string,
  format: "structured",
): Promise<FetchedArticle<StructuredArticle> | null>;
export function fetchParsedArticle(
  lawId: string,
  articleNumber: string,
  format: "text" | "structured",
): Promise<FetchedArticle<ParsedArticle | StructuredArticle> | null>;
export async function fetchParsedArticle(
  lawId: string,
  articleNumber: string,
  format: "text" | "structured" = "text",
): Promise<FetchedArticle<ParsedArticle | StructuredArticle> | null> {
  const data = await fetchArticleData(lawId, articleNumber);
  if (!data) return null;
  const parse = format === "structured" ? parseArticleStructured : parseArticle;
  const article = parse(data.law_full_text, articleNumber);
  if (article) return { article };

  const special = detectSpecialSection(articleNumber);
  if (
    special?.type !== "suppl_amendment" &&
    special?.type !== "suppl_amendment_article"
  ) {
    return null;
  }

  const revisions = await getLawRevisions(lawId);
  const revision = revisions.revisions.find(
    (entry) =>
      entry.law_revision_id !== data.revision_info.law_revision_id &&
      matchAmendLawNum(special.amendLawNum, entry.amendment_law_num),
  );
  let missingData = data;
  if (revision) {
    const revisionData = await getLawDataByRevision(revision.law_revision_id);
    const revisedArticle = parse(revisionData.law_full_text, articleNumber);
    if (revisedArticle) {
      const metadata = {
        law_revision_id: revision.law_revision_id,
        amendment_enforcement_date: revision.amendment_enforcement_date,
        current_revision_status: revision.current_revision_status,
      };
      const label = revision.current_revision_status === "UnEnforced"
        ? "未施行の改正"
        : "別の改正";
      return {
        article: revisedArticle,
        revision: metadata,
        revisionNote: `※ この附則は${label}（施行日 ${revision.amendment_enforcement_date}）の法令データから取得しました。`,
      };
    }
    if (findAmendmentSupplProvision(
      revisionData.law_full_text,
      special.amendLawNum,
    )) {
      missingData = revisionData;
    }
  }

  if (special.type === "suppl_amendment_article") {
    const suppl = findAmendmentSupplProvision(
      missingData.law_full_text,
      special.amendLawNum,
    );
    if (suppl) {
      const numbers = getSupplProvisionArticleNumbers(suppl).map((num) => {
        const [main, ...branches] = num.split("_");
        return `第${main}条${branches.map((branch) => `の${branch}`).join("")}`;
      });
      const title = missingData.revision_info.law_title;
      const qualifier = suppl.attr?.["Extract"] === "true" ? "は抄録で、" : "には";
      const contents = numbers.length > 0
        ? `${numbers.join("・")}のみ収録されています。`
        : "条番号付きの条文は収録されていません。";
      throw new ArticleNotFoundError(
        articleNumber,
        title,
        `${title}の附則（${special.amendLawNum}）${qualifier}${contents}`,
      );
    }
  }
  return null;
}
