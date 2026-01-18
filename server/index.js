// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

// Routes
import authRoutes from "./routes/auth.js";
import deviceRoutes from "./routes/devices.js";
import siteRoutes from "./routes/sites.js";
import roomsRoutes from "./routes/rooms.js";
import floorsRoutes from "./routes/floors.js";
import complexes from "./routes/complexes.js";
import unitRoutes from "./routes/units.js";
import pbdRoutes from "./routes/pbd.js";
import { devQueue } from "./routes/devQueue.js";

// Edge webhook (JWT-гүй)
import edgeRoutes from "../src/routes/edge.routes.js";

// CAM proxy
import camProxy from "../src/routes/camProxy.js";

// Middleware
import { auth } from "./middleware/auth.js";

// Controllers
import { getLatestForSite } from "../src/controllers/pbdLatest.js";

const app = express();
app.set("trust proxy", 1);

// --------------------
// CORS + body parsers
// --------------------
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// --------------------
// Prisma
// --------------------
const prisma = new PrismaClient();
app.locals.prisma = prisma;

const PORT = Number(process.env.PORT || 4000);

// --------------------
// Static /cdn (PBD json татах)
// --------------------
const CDN_ROOT = process.env.CDN_ROOT || "/var/app/cdn";
app.use(
  "/cdn",
  express.static(CDN_ROOT, {
    etag: true,
    maxAge: "1d",
    setHeaders: (res) => {
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, stale-while-revalidate=604800"
      );
    },
  })
);

// --------------------
// Health
// --------------------
app.get("/health", (_req, res) =>
  res.json({ ok: true, ts: new Date().toISOString() })
);

// --------------------
// Auth routes (JWT шаарддаггүй)
// --------------------
app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);

// --------------------
// /me (JWT)
// --------------------
app.get("/me", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, phoneE164: true, displayName: true },
    });

    const households = await prisma.householdMember.findMany({
      where: { userId: req.user.sub, status: "active" },
      select: { role: true, household: { select: { id: true, name: true } } },
    });

    res.json({ ok: true, user, households });
  } catch (e) {
    console.error("[ME] error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// --------------------
// Edge webhook (JWT-гүй, тусдаа prefix)
// --------------------
app.use("/edgehooks", edgeRoutes);

// --------------------
// ✅ JWT шаардлагатай бүх API (эндээс доош бүгд auth)
// --------------------
app.use("/api", auth);

// --------------------
// ✅ CAM proxy (JWT хамгаалалттай)
// URL жишээ: /api/cam/edge_nas_01/api/stream.m3u8?src=...
// --------------------
app.use("/api/cam", camProxy);

// --------------------
// API routers (JWT хамгаалалттай)
// --------------------
app.use("/api", deviceRoutes);
app.use("/api", siteRoutes);
app.use("/api", roomsRoutes);
app.use("/api", floorsRoutes);
app.use("/api/complexes", complexes);
app.use("/api/units", unitRoutes);

// --------------------
// PBD routes (JWT хамгаалалттай)
// --------------------
app.use("/api/pbd", pbdRoutes);

// ✅ PBD latest (legacy хэвээр)
// /api/site/:siteId/pbd/latest
app.get("/api/site/:siteId/pbd/latest", getLatestForSite);

// ✅ HTML чинь ингэж дууддаг тул alias нэмэв:
// /api/pbd/latest?siteId=...&floorId=...
app.get("/api/pbd/latest", (req, res, next) => {
  req.params.siteId = String(req.query.siteId || "");
  return getLatestForSite(req, res, next);
});

// --------------------
// Dev queue (JWT хамгаалалттай)
// --------------------
app.use("/api/dev", devQueue);

// --------------------
// 404 & error handlers
// --------------------
app.use((req, res) =>
  res.status(404).json({ error: "not_found", path: req.path })
);

app.use((err, _req, res, _next) => {
  console.error("[UNCAUGHT]", err);
  res.status(500).json({ error: "server_error" });
});

// --------------------
// START & graceful shutdown
// --------------------
const server = app.listen(PORT, () => console.log(`API listening on :${PORT}`));

const shutdown = async () => {
  try {
    await prisma.$disconnect();
  } catch {}
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
