// server/app.js  (эсвэл src/app.js)
import express from 'express';
import cors from 'cors';

// JWT-тэй хэрэглэгчийн API
import deviceRoutes from '../server/routes/devices.js';
// Edge webhook (HMAC, JWT хэрэггүй)
import edgeRoutes from './routes/edge.routes.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true }));
app.use(express.json());

// Хэрэглэгчийн API (JWT шаардлагатай — auth middleware-ээ энэ app-ийн гадна талд эсвэл энд хавчуулж болно)
app.use('/api', deviceRoutes);

// Edge webhook-уудаа тусад нь
app.use('/edgehooks', edgeRoutes);

export default app;
