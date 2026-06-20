import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://hubcredo-jet.vercel.app",
    "https://pipeline.hubcredo.com"
    // add any other Vercel preview URLs if needed
  ],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
