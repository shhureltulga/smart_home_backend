// server/prisma.js
import { PrismaClient } from '@prisma/client';

// dev HMR үед олон instance үүсэхээс сэргийлнэ
const g = globalThis;
const prisma = g.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  g.__prisma = prisma;
}

export default prisma;
