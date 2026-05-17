import express, { type Request, type Response } from "express";
import cors from "cors";
import { config, isMongoConfigured, isVertexConfigured } from "./config.js";
import { ingestRouter } from "./routes/ingest.js";
import { searchRouter } from "./routes/search.js";
import { agentRouter } from "./routes/agent.js";
import { actionsRouter } from "./routes/actions.js";
import { commitmentsRouter } from "./routes/commitments.js";
import { briefingsRouter } from "./routes/briefings.js";
import { graphRouter } from "./routes/graph.js";

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    service: "mnemos-agent",
    status: "ok",
    time: new Date().toISOString(),
  });
});

app.get("/ready", (_req: Request, res: Response) => {
  res.json({
    atlas: isMongoConfigured() ? "configured" : "missing",
    vertex: isVertexConfigured() ? "configured" : "missing",
    geminiModel: config.VERTEX_GEMINI_MODEL,
    embeddingModel: config.VERTEX_EMBEDDING_MODEL,
    region: config.GOOGLE_CLOUD_LOCATION,
  });
});

app.use(ingestRouter);
app.use(searchRouter);
app.use(agentRouter);
app.use(actionsRouter);
app.use(commitmentsRouter);
app.use(briefingsRouter);
app.use(graphRouter);

app.listen(config.AGENT_PORT, () => {
  console.log(`[mnemos-agent] listening on :${config.AGENT_PORT}`);
});
