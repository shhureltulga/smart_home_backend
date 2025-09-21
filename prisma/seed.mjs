// prisma/seed.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

  // Nested create: household + owner membership
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
    // P2002 = unique constraint (householdId,userId) — давхцвал алгас
    if (e?.code !== 'P2002') throw e;
  }
}

async function main() {
  const owner = await upsertUser('+97680000001', 'Owner User', '123456');
  const admin = await upsertUser('+97680000002', 'Admin User', '123456');
  const member = await upsertUser('+97680000003', 'Member User', '123456');

  const home = await ensureHousehold('My Home', owner.id);

  await addMember(home.id, admin.id, 'admin');
  await addMember(home.id, member.id, 'member');

  console.log('Seed done:', {
    users: [owner.phoneE164, admin.phoneE164, member.phoneE164],
    household: home
  });
}

main()
  .catch((e) => { console.error('SEED ERROR:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
