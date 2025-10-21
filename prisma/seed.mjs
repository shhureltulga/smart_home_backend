// prisma/seed.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** ---------------- Enums & Constants ---------------- */
const City = {
  ULAANBAATAR: 'ULAANBAATAR',
  DARKHAN: 'DARKHAN',
  ERDENET: 'ERDENET',
  OTHER: 'OTHER',
};

const DistrictUB = {
  KHAN_UUL: 'KHAN_UUL',
  BAYANGOL: 'BAYANGOL',
  BAYANZURKH: 'BAYANZURKH',
  SONGINOKHAIRKHAN: 'SONGINOKHAIRKHAN',
  CHINGELTEI: 'CHINGELTEI',
  SUKHBAATAR: 'SUKHBAATAR',
  NALAIKH: 'NALAIKH',
  BAGANUUR: 'BAGANUUR',
  BAGAKHANGAI: 'BAGAKHANGAI',
};

const District = {
  ...DistrictUB,
  NONE: 'NONE',
};

const UB_DEFAULT_CENTER = { lat: 47.917, lng: 106.917 };

/** ---------------- Helpers ---------------- */
async function upsertUser(phone, name, plainPassword) {
  const passwordHash = plainPassword ? await bcrypt.hash(plainPassword, 10) : undefined;

  const user = await prisma.user.upsert({
    where: { phoneE164: phone },
    update: {
      displayName: name,
      ...(passwordHash ? { passwordHash, passwordSetAt: new Date() } : {}),
    },
    create: {
      phoneE164: phone,
      displayName: name,
      ...(passwordHash ? { passwordHash, passwordSetAt: new Date() } : {}),
    },
    select: { id: true, phoneE164: true, displayName: true },
  });

  if (!user?.id) throw new Error(`upsertUser failed for ${phone}`);
  return user;
}

async function ensureHousehold(name, ownerId) {
  if (!ownerId) throw new Error('ensureHousehold: ownerId is undefined');

  const existing = await prisma.household.findFirst({
    where: { name, createdById: ownerId },
    select: { id: true, name: true },
  });
  if (existing) return existing;

  const h = await prisma.household.create({
    data: {
      name,
      createdById: ownerId,
      members: {
        create: {
          userId: ownerId,
          role: 'owner',
          status: 'active',
        },
      },
    },
    select: { id: true, name: true },
  });
  return h;
}

async function addMember(householdId, userId, role = 'member') {
  if (!householdId || !userId) return;

  try {
    await prisma.householdMember.create({
      data: { householdId, userId, role, status: 'active' },
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

  if (ENV_SITE_ID) {
    let site = await prisma.site.findUnique({ where: { id: ENV_SITE_ID } });
    if (site) {
      if (site.householdId !== householdId) {
        throw new Error(
          `SITE_ID (${ENV_SITE_ID}) household mismatch: expected ${householdId}, got ${site.householdId}`,
        );
      }
      return site;
    }
    site = await prisma.site.create({
      data: {
        id: ENV_SITE_ID,
        householdId,
        name: 'Default Site',
        latitude: UB_DEFAULT_CENTER.lat,
        longitude: UB_DEFAULT_CENTER.lng,
      },
      select: { id: true, name: true, householdId: true },
    });
    return site;
  }

  let site = await prisma.site.findFirst({
    where: { householdId, name: 'Default Site' },
    select: { id: true, name: true, householdId: true },
  });
  if (site) return site;

  site = await prisma.site.create({
    data: {
      householdId,
      name: 'Default Site',
      latitude: UB_DEFAULT_CENTER.lat,
      longitude: UB_DEFAULT_CENTER.lng,
    },
    select: { id: true, name: true, householdId: true },
  });
  return site;
}

/** -------- Complex + Blocks + Entrances + Units -------- */
async function upsertComplexWithStructure() {
  // 1) Complex (city/district enum-тай)
  const complexName = 'Хүннү 2222 (Demo)';
  let complex = await prisma.complex.findFirst({
    where: { name: complexName, city: City.ULAANBAATAR, district: District.KHAN_UUL },
    select: { id: true },
  });

  if (!complex) {
    complex = await prisma.complex.create({
      data: {
        name: complexName,
        city: City.ULAANBAATAR,
        district: District.KHAN_UUL,
        address: 'Чингисийн өргөн чөлөө...',
        centerLat: 47.9067,
        centerLng: 106.9059,
        // Жишээ GeoJSON Polygon — хүсвэл солино
        geo: {
          type: 'Polygon',
          coordinates: [
            [
              [106.9051, 47.9064],
              [106.9062, 47.9064],
              [106.9062, 47.9071],
              [106.9051, 47.9071],
              [106.9051, 47.9064],
            ],
          ],
        },
      },
      select: { id: true, name: true },
    });
  }

  // 2) Block-ууд
  const blocksPayload = [
    { name: 'A блок', floors: 16, entrances: 2, entrancesR: [{ name: '1-р орц' }, { name: '2-р орц' }] },
    { name: 'B блок', floors: 12, entrances: 1, entrancesR: [{ name: '1-р орц' }] },
  ];

  for (const b of blocksPayload) {
    // block давхардахгүй байлгахын тулд нэрээр шалгая
    let block = await prisma.block.findFirst({
      where: { complexId: complex.id, name: b.name },
      select: { id: true },
    });

    if (!block) {
      block = await prisma.block.create({
        data: {
          complexId: complex.id,
          name: b.name,
          floors: b.floors ?? null,
          entrances: b.entrances ?? null,
        },
        select: { id: true, name: true },
      });

      if (b.entrancesR?.length) {
        for (const e of b.entrancesR) {
          await prisma.entrance.create({
            data: { blockId: block.id, name: e.name },
          });
        }
      }
    }
  }

  // 3) Жишээ Units
  const units = [
    { number: 'A-12-45', floor: 12, areaSqm: 68.3, status: 'vacant', blockName: 'A блок', entranceName: '1-р орц' },
    { number: 'A-05-11', floor: 5, areaSqm: 52.0, status: 'occupied', blockName: 'A блок', entranceName: '2-р орц' },
    { number: 'B-03-07', floor: 3, areaSqm: 44.2, status: 'vacant', blockName: 'B блок', entranceName: '1-р орц' },
  ];

  for (const u of units) {
    // block + entrance id олно
    const block = await prisma.block.findFirst({
      where: { complexId: complex.id, name: u.blockName },
      select: { id: true },
    });

    const entrance = block
      ? await prisma.entrance.findFirst({
          where: { blockId: block.id, name: u.entranceName },
          select: { id: true },
        })
      : null;

    // @@unique([complexId, number]) тул upsert-подхоц: findFirst->create
    const exists = await prisma.unit.findFirst({
      where: { complexId: complex.id, number: u.number },
      select: { id: true },
    });

    if (!exists) {
      await prisma.unit.create({
        data: {
          complexId: complex.id,
          blockId: block?.id ?? null,
          entranceId: entrance?.id ?? null,
          number: u.number,
          floor: u.floor ?? null,
          areaSqm: u.areaSqm ?? null,
          status: u.status ?? null,
        },
      });
    }
  }

  return complex;
}

/** -------- Link one Unit <-> Site (1:1) -------- */
async function linkOneUnitToSite(siteId, complexId) {
  // аль нэг unit-ыг сонгон site-тай холбоно. өмнө нь холбогдсон бол алгасна.
  const unit = await prisma.unit.findFirst({
    where: { complexId, siteId: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, number: true, siteId: true },
  });
  if (!unit) {
    return null; // холбоход сул unit олдсонгүй
  }

  // 1:1 unique тул бусад unit-ууд мөн энэ siteId-г ашиглаж болохгүй.
  const taken = await prisma.unit.findFirst({ where: { siteId } });
  if (taken) {
    // аль хэдийн энэ Site өөр unit-тай холбогдсон, тэгвэл холбоос хийхгүй алгасъя
    return { skipped: true, reason: 'Site already linked' };
  }

  const updated = await prisma.unit.update({
    where: { id: unit.id },
    data: { siteId },
    select: { id: true, number: true, siteId: true },
  });
  return updated;
}

/** ---------------- Main ---------------- */
async function main() {
  // === Users ===
  const owner = await upsertUser('+97680000001', 'Owner User', '123456');
  const admin = await upsertUser('+97680000002', 'Admin User', '123456');
  const member = await upsertUser('+97680000003', 'Member User', '123456');

  // === Household ===
  const home = await ensureHousehold('My Home', owner.id);

  // === Members ===
  await addMember(home.id, admin.id, 'admin');
  await addMember(home.id, member.id, 'member');

  // === Site (заавал) ===
  const site = await ensureSite(home.id);

  // === Complex structure ===
  const complex = await upsertComplexWithStructure();

  // === Link Unit <-> Site (1:1) ===
  const linkResult = await linkOneUnitToSite(site.id, complex.id);

  console.log('Seed done:', {
    users: [owner.phoneE164, admin.phoneE164, member.phoneE164],
    household: home,
    site,
    complex,
    linkResult,
  });
}

main()
  .catch((e) => {
    console.error('SEED ERROR:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
