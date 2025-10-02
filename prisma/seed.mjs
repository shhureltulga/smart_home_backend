// prisma/seed.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** -------- Helpers -------- */
async function upsertUser(phone, name, plainPassword) {
  const passwordHash = plainPassword ? await bcrypt.hash(plainPassword, 10) : undefined;

  const user = await prisma.user.upsert({
    where: { phoneE164: phone },
    update: {
      displayName: name,
      ...(passwordHash ? { passwordHash, passwordSetAt: new Date() } : {})
    },
    create: {
      phoneE164: phone,
      displayName: name,
      ...(passwordHash ? { passwordHash, passwordSetAt: new Date() } : {})
    },
    select: { id: true, phoneE164: true, displayName: true }
  });

  if (!user?.id) throw new Error(`upsertUser failed for ${phone}`);
  return user;
}

async function ensureHousehold(name, ownerId) {
  if (!ownerId) throw new Error('ensureHousehold: ownerId is undefined');

  const existing = await prisma.household.findFirst({
    where: { name, createdById: ownerId },
    select: { id: true, name: true }
  });
  if (existing) return existing;

  // Household + owner membership
  const h = await prisma.household.create({
    data: {
      name,
      createdById: ownerId,
      members: {
        create: {
          userId: ownerId,
          role: 'owner',
          status: 'active'
        }
      }
    },
    select: { id: true, name: true }
  });
  return h;
}

async function addMember(householdId, userId, role = 'member') {
  if (!householdId || !userId) return;

  try {
    await prisma.householdMember.create({
      data: { householdId, userId, role, status: 'active' }
    });
  } catch (e) {
    // P2002 = unique constraint (householdId,userId)
    if (e?.code !== 'P2002') throw e;
  }
}

/**
 * Site-ийг заавал үүсгэнэ.
 * - Хэрэв .env дотор SITE_ID өгөгдвөл тэр ID-гаар create/connect хийнэ.
 * - Байхгүй бол household дотор "Default Site" нэртэйг хайж, байхгүй бол үүсгэнэ.
 */
async function ensureSite(householdId) {
  if (!householdId) throw new Error('ensureSite: householdId is undefined');

  const ENV_SITE_ID = (process.env.SITE_ID || '').trim();

  // 1) SITE_ID-гаар шалгах
  if (ENV_SITE_ID) {
    let site = await prisma.site.findUnique({ where: { id: ENV_SITE_ID } });
    if (site) {
      if (site.householdId !== householdId) {
        throw new Error(
          `SITE_ID (${ENV_SITE_ID}) household mismatch: expected ${householdId}, got ${site.householdId}`
        );
      }
      return site;
    }
    // Байхгүй бол өгсөн ID-гаар үүсгэнэ
    site = await prisma.site.create({
      data: {
        id: ENV_SITE_ID,
        householdId,
        name: 'Default Site',
      },
      select: { id: true, name: true, householdId: true }
    });
    return site;
  }

  // 2) SITE_ID байхгүй үед нэрээр хайж/үүсгэнэ
  let site = await prisma.site.findFirst({
    where: { householdId, name: 'Default Site' },
    select: { id: true, name: true, householdId: true }
  });
  if (site) return site;

  site = await prisma.site.create({
    data: { householdId, name: 'Default Site' },
    select: { id: true, name: true, householdId: true }
  });
  return site;
}

async function main() {
  // === Users ===
  const owner  = await upsertUser('+97680000001', 'Owner User',  '123456');
  const admin  = await upsertUser('+97680000002', 'Admin User',  '123456');
  const member = await upsertUser('+97680000003', 'Member User', '123456');

  // === Household ===
  const home = await ensureHousehold('My Home', owner.id);

  // === Members ===
  await addMember(home.id, admin.id,  'admin');
  await addMember(home.id, member.id, 'member');

  // === Site (заавал) ===
  const site = await ensureSite(home.id);

  console.log('Seed done:', {
    users: [owner.phoneE164, admin.phoneE164, member.phoneE164],
    household: home,
    site
  });
}

main()
  .catch((e) => { console.error('SEED ERROR:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
