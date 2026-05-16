import { z } from "zod";

const schema = z.object({
  AGENT_PORT: z.coerce.number().int().positive().default(8787),
  MONGODB_URI: z.string().default(""),
  MONGODB_DB: z.string().default("mnemos"),
  MONGODB_VECTOR_INDEX: z.string().default("mnemos_vector_index"),
  GOOGLE_CLOUD_PROJECT: z.string().default(""),
  GOOGLE_CLOUD_LOCATION: z.string().default("us-central1"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default(""),
  VERTEX_GEMINI_MODEL: z.string().default("gemini-3-pro"),
  VERTEX_EMBEDDING_MODEL: z.string().default("text-embedding-004"),
});

export const config = schema.parse(process.env);

export const isMongoConfigured = () => config.MONGODB_URI.startsWith("mongodb");
export const isVertexConfigured = () =>
  config.GOOGLE_CLOUD_PROJECT.length > 0;

export type AppConfig = typeof config;
