import express from 'express';
import cors from 'cors';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { initializeDatabase } from './db/index.js';
import materialsRouter from './routes/materials.js';
import subjectsRouter from './routes/subjects.js';
import examsRouter from './routes/exams.js';
import configRouter from './routes/config.js';
import analyticsRouter from './routes/analytics.js';
import questionsRouter from './routes/questions.js';
import dashboardRouter from './routes/dashboard.js';
import reviewRouter from './routes/review.js';
import wrongQuestionsRouter from './routes/wrong-questions.js';

const DEFAULT_PORT = 3001;

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT) || DEFAULT_PORT;

  const available = await isPortAvailable(port);
  if (!available) {
    console.error(`错误：端口 ${port} 已被占用，请关闭占用该端口的程序或设置 PORT 环境变量使用其他端口。`);
    process.exit(1);
  }

  // Initialize database tables
  initializeDatabase();

  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  // Register routes
  app.use(materialsRouter);
  app.use(questionsRouter);

  app.use('/api/subjects', subjectsRouter);

  app.use(examsRouter);

  app.use('/api/config', configRouter);

  app.use('/api/subjects', analyticsRouter);

  app.use('/api/subjects', reviewRouter);

  app.use('/api/subjects', wrongQuestionsRouter);

  app.use('/api/dashboard', dashboardRouter);

  // Serve the built frontend (production). In dev, Vite serves the SPA on :5173.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
    app.use(express.static(frontendDist));
    // SPA fallback: send index.html for any non-API GET route (client-side routing)
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    console.log(`已启用前端静态资源服务: ${frontendDist}`);
  }

  app.listen(port, () => {
    console.log(`AI 考试学习平台后端服务已启动: http://localhost:${port}`);
  });
}

startServer();
