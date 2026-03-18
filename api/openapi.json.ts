import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateOpenApiSpec } from "../src/lib/openapi-spec.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600");

  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const host =
    req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const baseUrl = `${protocol}://${host}`;

  const spec = await generateOpenApiSpec(baseUrl);
  res.status(200).json(spec);
}
