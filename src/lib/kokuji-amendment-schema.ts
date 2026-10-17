import { z } from "zod";

export const kokujiAmendmentsSchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  source_url: z.string(),
  coverage: z.string(),
  items: z.array(z.object({
    number: z.string(), title: z.string(), promulgated_on: z.string().nullable(),
    effective_on: z.string().nullable(), effective_note: z.string().nullable(),
    documents: z.array(z.object({ label: z.string(), url: z.string() })),
    matched_by: z.enum(["pdf", "page", "title"]),
  })),
  omitted_count: z.number().int().nonnegative(),
  unresolved_count: z.number().int().nonnegative(),
});
