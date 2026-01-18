import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const r = express.Router();

const EDGE_MAP = {
  edge_nas_01: "http://100.125.38.3:1984",
};

const GO2RTC_USER = process.env.GO2RTC_USER || "admin";
const GO2RTC_PASS = process.env.GO2RTC_PASS || "StrongPass123";
const basic = Buffer.from(`${GO2RTC_USER}:${GO2RTC_PASS}`).toString("base64");

const proxyCache = {};

function getProxy(edgeKey) {
  const target = EDGE_MAP[edgeKey];
  if (!target) return null;

  if (!proxyCache[edgeKey]) {
    proxyCache[edgeKey] = createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
      // /api/cam/edge_nas_01/api/xxx -> /api/xxx
      pathRewrite: (path, req) => {
        // path ж: "/api/stream.m3u8?src=..."
        // router дээр edgeKey-г аль хэдийн салгасан тул энэ хэвээр OK
        return path;
      },

      // ✅ v3/v4 дээр энэ callback ингэж ажиллана
      on: {
        proxyReq: (proxyReq, req, res) => {
          // edge рүү Basic auth өгнө
          proxyReq.setHeader("Authorization", `Basic ${basic}`);
        },
        proxyRes: (proxyRes, req, res) => {
          const wa = proxyRes.headers["www-authenticate"];
          console.log("[camProxy] upstream", proxyRes.statusCode, wa || "");
        },
        error: (err, req, res) => {
          console.error("[camProxy] error:", err?.code || err?.message);
        },
      },
    });
  }

  return proxyCache[edgeKey];
}

r.use("/:edgeKey", (req, res, next) => {
  const proxy = getProxy(req.params.edgeKey);
  if (!proxy) return res.status(404).json({ error: "unknown_edge" });
  return proxy(req, res, next);
});

export default r;
