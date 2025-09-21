import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createProxyMiddleware } from 'http-proxy-middleware';

export async function registerRoutes(app: Express): Promise<Server> {
  // Development proxy to Django backend if we are in dev and no explicit API base
  // This allows the frontend to call /api/... directly.
  const target = process.env.DJANGO_API_ORIGIN || 'http://localhost:8000';
  if (app.get('env') === 'development') {
    app.use('/api', createProxyMiddleware({
      target,
      changeOrigin: true,
      // Preserve path (/api/memories/...)
      logLevel: 'silent',
    }));
  }

  const httpServer = createServer(app);
  return httpServer;
}
