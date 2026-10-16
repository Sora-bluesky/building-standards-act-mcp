import { z } from "zod";
import type { StructuredSubitem } from "./types.js";

const articleReferenceSchema = z.object({
  raw_text: z.string(),
  ref_type: z.enum([
    "same_law",
    "cross_law",
    "relative",
    "delegation",
    "unknown",
  ]),
  target_law: z.string().optional(),
  target_article: z.string().optional(),
  target_paragraph: z.string().optional(),
  target_item: z.string().optional(),
});

export const parsedArticleSchema = z.object({
  article_num: z.string(),
  article_caption: z.string(),
  article_title: z.string(),
  text: z.string(),
  references: z.array(articleReferenceSchema).optional(),
});

const structuredSubitemSchema: z.ZodType<StructuredSubitem> = z.lazy(() =>
  z.object({
    subitem_num: z.string(),
    subitem_title: z.string(),
    subitem_sentence: z.string(),
    subitems: z.array(structuredSubitemSchema),
  }),
);

const structuredItemSchema = z.object({
  item_num: z.string(),
  item_title: z.string(),
  item_sentence: z.string(),
  subitems: z.array(structuredSubitemSchema),
});

const structuredParagraphSchema = z.object({
  paragraph_num: z.string(),
  paragraph_sentence: z.string(),
  items: z.array(structuredItemSchema),
});

export const structuredArticleSchema = z.object({
  article_num: z.string(),
  article_caption: z.string(),
  article_title: z.string(),
  paragraphs: z.array(structuredParagraphSchema),
  references: z.array(articleReferenceSchema).optional(),
});
