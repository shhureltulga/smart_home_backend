// server/routes/devices.js
import { Router } from 'express';
import { auth } from '../middleware/auth.js'; 
// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();
const r = Router();

/* ----------------------- Туслах функцууд ----------------------- */

// household-аар нэрээс roomId resolve
async function resolveRoomId({ householdId, roomId, roomName }) {
  if (roomId) return roomId;
  if (!roomName) return undefined;
  const found = await prisma.room.findFirst({
    where: {
      householdId,
      OR: [{ name: roomName }, { displayName: roomName }],
    },
    select: { id: true },
  });
  return found?.id;
}


/* ----------------------- Household overview ----------------------- */

// Өөрийн household-ууд
r.get('/households', async (req, res) => {
  const rows = await prisma.householdMember.findMany({
    where: { userId: req.user.sub, status: 'active' },
    select: { role: true, household: { select: { id: true, name: true } } },
  });
  res.json({
    ok: true,
    households: rows.map(x => ({
      id: x.household.id,
      name: x.household.name,
      role: x.role,
    })),
  });
});

// Нэг household-ын rooms + devices + latest
r.get('/households/:hid/overview', async (req, res) => {
  const hid = req.params.hid;
  // эрх шалгах
  const member = await prisma.householdMember.findFirst({
    where: { householdId: hid, userId: req.user.sub, status: 'active' },
  });
  if (!member) return res.status(403).json({ error: 'forbidden' });

  const [rooms, devices, latest] = await Promise.all([
    prisma.room.findMany({ where: { householdId: hid } }),
    prisma.device.findMany({ where: { householdId: hid } }),
    prisma.latestSensor.findMany({ where: { householdId: hid } }),
  ]);

  res.json({ ok: true, rooms, devices, latest });
});

/* ----------------------- Device register / upsert -----------------------
   HMAC хамгаалалттай. Доорх payload хэлбэрүүдийг ДЭМЖИНЭ:
   A) Bulk:
      {
        householdId, siteId, edgeId,
        mode: "upsert",
        devices: [
          { deviceKey, name, type, domain?, deviceClass?, roomId?, roomName?, floorId?, pos? },
          ...
        ]
      }

   B) Single:
      {
        householdId, siteId, edgeId?,
        deviceKey, name, type, domain?, deviceClass?, roomId?, roomName?, floorId?, pos?
      }
-------------------------------------------------------------------------- */

/* ----------------------- PATCH: device room update -----------------------
   - roomId эсвэл roomName-аар шинэчилнэ (roomName ирвэл household-аар resolve)
--------------------------------------------------------------------------- */
r.patch('/devices/:id/room', async (req, res) => {
  try {
    const { id } = req.params;
    const { roomId, roomName } = req.body || {};

    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) return res.status(404).json({ ok: false, error: 'not_found' });

    const resolvedRoomId = await resolveRoomId({
      householdId: device.householdId,
      roomId,
      roomName,
    });
    if (!resolvedRoomId) return res.status(400).json({ ok: false, error: 'invalid_room' });

    const updated = await prisma.device.update({
      where: { id },
      data: { roomId: resolvedRoomId, updatedAt: new Date() },
    });

    res.json({ ok: true, device: updated });
  } catch (e) {
    console.error('[devices.room] error', e);
    res.status(500).json({ ok: false, error: 'server_error', detail: String(e) });
  }
});

/* ----------------------- PATCH: device position ----------------------- */
r.patch('/devices/:id/position', async (req, res) => {
  try {
    const { id } = req.params;
    const { pos } = req.body || {};

    if (!pos || typeof pos !== 'object') {
      return res.status(400).json({ ok: false, error: 'pos_object_required' });
    }

    const updated = await prisma.device.update({
      where: { id },
      data: { pos, updatedAt: new Date() },
    });

    res.json({ ok: true, device: updated });
  } catch (e) {
    console.error('[devices.position] error', e);
    res.status(500).json({ ok: false, error: 'server_error', detail: String(e) });
  }
});

/* ----------------------- Devices by site+floor (PBD-д) ----------------------- */
/* GET /api/sites/:siteId/floors/:floorId/devices
   → [{ id, name, domain, type, roomId, pos, isOn, deviceKey, label, sensors: [...] }] */

r.get('/sites/:siteId/floors/:floorId/devices', async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { siteId, floorId } = req.params;

  // 1) Энэ давхрын өрөөнүүд – name-ийг нь бас авна
  const rooms = await prisma.room.findMany({
    where: { siteId, floorId },
    select: { id: true, name: true, floorId: true },
  });
  const roomIds = rooms.map((r) => r.id);
  const roomIdSet = new Set(roomIds);
  const roomNameById = new Map(
    rooms.map((r) => [r.id, (r.name || 'Room').trim()])
  );

  // 2) Төхөөрөмжүүд
  const rawDevices = await prisma.device.findMany({
    where: {
      siteId,
      OR: [
        { floorId }, // өөр дээрээ энэ давхарт байгаа
        roomIds.length
          ? { roomId: { in: roomIds } } // энэ давхрын өрөөнүүдэд байгаа
          : { id: { in: [] } },
      ],
    },
    orderBy: [{ roomId: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      domain: true,
      type: true,
      deviceClass: true,
      roomId: true,
      floorId: true,
      pos: true,
      isOn: true,
      deviceKey: true,
      label: true,
    },
  });

  const DEFAULT_POS = { x: 0, y: 0.9, z: 0 };

  // 3) Эдгээр deviceKey-үүдийн latestSensor-уудыг татна
  const deviceKeys = rawDevices.map((d) => d.deviceKey);
  const latestRows = deviceKeys.length
    ? await prisma.latestSensor.findMany({
        where: {
          siteId,
          deviceKey: { in: deviceKeys },
        },
        select: {
          deviceKey: true,
          entityKey: true,
          value: true,
          unit: true,
          stateClass: true,
          domain: true,
          haEntityId: true,
        },
      })
    : [];

  const sensorsByKey = new Map();
  for (const s of latestRows) {
    const arr = sensorsByKey.get(s.deviceKey) || [];
    arr.push({
      entityKey: s.entityKey,
      value: s.value,
      unit: s.unit,
      stateClass: s.stateClass,
      domain: s.domain,
      haEntityId: s.haEntityId,
    });
    sensorsByKey.set(s.deviceKey, arr);
  }

  // 4) Floor + pos + sensors + roomName
  const devices = rawDevices.map((d) => ({
    ...d,
    floorId:
      d.floorId ?? (d.roomId && roomIdSet.has(d.roomId) ? floorId : null),
    pos: d.pos ?? DEFAULT_POS,
    sensors: sensorsByKey.get(d.deviceKey) || [],
    roomName: d.roomId ? roomNameById.get(d.roomId) || null : null,
  }));

  res.json({ ok: true, devices });
});



/* Edge рүү push хийх best-effort туслах */
async function pushToEdgeIfPossible(prisma, edge, edgeCmd, sendCommand) {
  if (!edge?.baseUrl) return { pushed: false };
  try {
    const result = await sendCommand(edge, edgeCmd); // танай services/edgeClient.js
    await prisma.edgeCommand.update({
      where: { id: edgeCmd.id },
      data: { status: 'sent', sentAt: new Date() },
    });
    return { pushed: true, result };
  } catch (e) {
    // push бүтэлгүйтвэл queued хэвээр үлдээнэ
    await prisma.edgeCommand.update({
      where: { id: edgeCmd.id },
      data: { status: 'queued', error: String(e) },
    });
    return { pushed: false, error: String(e) };
  }
}

/* POST /api/devices/:id/command
   body: { action: 'on'|'off'|'toggle'|'set_brightness'|..., value?: any }
*/
r.post('/devices/:id/command', auth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { action, value, entityKey, haEntityId } = req.body ?? {};
  const id = (req.params.id || '').trim();

  if (!id || !action) return res.status(400).json({ error: 'bad_request' });

  try {
    // Төхөөрөмж + харгалзах site/household
    const device = await prisma.device.findUnique({
      where: { id },
      select: {
        id: true, name: true, deviceKey: true, domain: true, type: true,
        siteId: true, householdId: true,
        site: { select: { id: true, edge: true } }, // EdgeNode-г авах
      },
    });
    if (!device) return res.status(404).json({ error: 'device_not_found' });

    // Эрх (household-д идэвхтэй гишүүн эсэх)
    const member = await prisma.householdMember.findFirst({
      where: { householdId: device.householdId, userId: req.user.sub, status: 'active' },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ error: 'forbidden' });

    // Хэрэглэгчийн үйлдлийн лог
    const ctrl = await prisma.deviceControl.create({
      data: {
        deviceId: device.id,
        userId: req.user.sub,
        action,
        oldValue: null,
        newValue: value ?? null,
      },
    });

    // Queue-д payload бэлтгэх
    const payload = {
      id: crypto.randomUUID(),
      type: 'device.command',
      ts: new Date().toISOString(),
      event: 'user.command',
      householdId: device.householdId,
      siteId: device.siteId,
      deviceId: device.id,
      deviceKey: device.deviceKey,
      domain: device.domain,
      devType: device.type,
      action,
      value: value ?? null,
      userId: req.user.sub,
      entityKey: entityKey ?? null,   // жишээ: 'Heat_Temperature', 'state'
      haEntityId: haEntityId ?? null, // жишээ: 'climate.xxx', 'switch.xxx'
    };

    // Queue-рүү бичих
    if (!device.site?.edge) {
      // Edge байхгүй бол зөвхөн queue үлдээх боломжгүй тул 404 эргүүлнэ
      return res.status(404).json({ error: 'edge_not_found' });
    }

    const edgeCmd = await prisma.edgeCommand.create({
      data: {
        edgeId: device.site.edge.id,
        payload,
        status: 'queued',
      },
    });

    // Шууд push хийж чадвал 'sent' болгоно (best-effort)
    const { pushed, result, error } =
      await pushToEdgeIfPossible(prisma, device.site.edge, edgeCmd, req.app.locals.sendCommand /* services/edgeClient.js-р дамжуул */);

    return res.json({
      ok: true,
      deviceId: device.id,
      controlId: ctrl.id,
      edgeCommandId: edgeCmd.id,
      pushed,
      result: result ?? null,
      error: error ?? null,
    });
  } catch (e) {
    console.error('[devices.command] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});

// POST /api/sites/:siteId/devices/:deviceKey/command
r.post('/sites/:siteId/devices/:deviceKey/command', auth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { siteId, deviceKey } = req.params;
  const { action, value, entityKey, haEntityId } = req.body ?? {};

  if (!action) return res.status(400).json({ error: 'bad_request' });

  // deviceKey + siteId-аар төхөөрөмжийг олно
  const device = await prisma.device.findFirst({
    where: { siteId, deviceKey },
    select: { id: true },
  });
  if (!device) return res.status(404).json({ error: 'device_not_found' });

  // Доорхыг дахин давтахгүй байхын тулд /devices/:id/command дээрх логикийг
  // тусдаа helper function болгож болно. Энд бол зүгээр л дуудаж болно:
  req.params.id = device.id;        // id-ийг override
  req.body = { action, value, entityKey, haEntityId };
  return r.handle(req, res);        // эсвэл логикийг copy/paste хийгээд ашигла
});

// 🌡 helper – latestSensor-уудаас нэгтгэсэн объект гаргаж авах
function buildLatestSummary(sensors) {
  const latest = {};

  for (const s of sensors) {
    const key  = (s.entityKey || '').toLowerCase();
    const unit = (s.unit || '').toLowerCase();
    const val  = s.value;

    // setpoint (паарны тохиргоо)
    if (key.includes('setpoint')) {
      if (latest.setpoint == null) latest.setpoint = val;
    }

    // temperature
    if (key.includes('temperature') || unit.includes('°c') || unit === 'c') {
      if (latest.temperature == null) latest.temperature = val;
    }

    // humidity
    if (key.includes('humidity') || unit === '%') {
      if (latest.humidity == null) latest.humidity = val;
    }

    // co2
    if (key.includes('co2')) {
      if (latest.co2 == null) latest.co2 = val;
    }

    // pressure
    if (key.includes('pressure') || unit.includes('hpa')) {
      if (latest.pressure == null) latest.pressure = val;
    }

    // battery
    if (key.includes('battery')) {
      if (latest.battery == null) latest.battery = val;
    }

    // link quality
    if (key.includes('lqi') || key.includes('linkquality')) {
      if (latest.lqi == null) latest.lqi = val;
    }
  }

  return latest;
}
// NEW: Mobile card-уудад зориулсан API
// GET /sites/:siteId/floors/:floorId/devices/card
r.get('/sites/:siteId/floors/:floorId/devices/card', async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const { siteId, floorId } = req.params;

    // 1) Энэ давхрын өрөөнүүд
    const rooms = await prisma.room.findMany({
      where: { siteId, floorId },
      select: { id: true, floorId: true },
    });
    const roomIds   = rooms.map(r => r.id);
    const roomIdSet = new Set(roomIds);

    // 2) Төхөөрөмжүүд
    const rawDevices = await prisma.device.findMany({
      where: {
        siteId,
        OR: [
          { floorId },                                // өөр дээрээ энэ давхар
          roomIds.length
            ? { roomId: { in: roomIds } }            // энэ давхрын өрөөнд байгаа
            : { id: { in: [] } },
        ],
      },
      orderBy: [{ roomId: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        domain: true,
        type: true,
        deviceClass: true,
        roomId: true,
        floorId: true,
        pos: true,
        isOn: true,
        deviceKey: true,
        label: true,
      },
    });

    const DEFAULT_POS = { x: 0, y: 0.9, z: 0 };

    // 3) Эдгээр deviceKey-үүдийн latestSensor-ууд
    const deviceKeys = rawDevices
      .map(d => d.deviceKey)
      .filter(k => !!k);

    const latestRows = deviceKeys.length
      ? await prisma.latestSensor.findMany({
          where: {
            siteId,
            deviceKey: { in: deviceKeys },
          },
          select: {
            deviceKey: true,
            entityKey: true,
            value: true,
            unit: true,
            stateClass: true,
            domain: true,
            haEntityId: true,
          },
        })
      : [];

    // deviceKey -> [sensors]
    const sensorsByKey = new Map();
    for (const s of latestRows) {
      const arr = sensorsByKey.get(s.deviceKey) || [];
      arr.push({
        entityKey: s.entityKey,
        value: s.value,
        unit: s.unit,
        stateClass: s.stateClass,
        domain: s.domain,
        haEntityId: s.haEntityId,
      });
      sensorsByKey.set(s.deviceKey, arr);
    }

    // 4) App-д зориулсан card model (нэг төхөөрөмж = нэг карт)
    const devices = rawDevices.map(d => {
      const sensors = sensorsByKey.get(d.deviceKey) || [];
      const latest  = buildLatestSummary(sensors);

      return {
        id: d.id,
        name: d.label || d.name,
        domain: d.domain,          // light / sensor / climate / switch ...
        type: d.type,
        deviceClass: d.deviceClass,
        roomId: d.roomId,
        floorId:
          d.floorId ||
          (d.roomId && roomIdSet.has(d.roomId) ? floorId : null),
        pos: d.pos || DEFAULT_POS,
        isOn: d.isOn,
        deviceKey: d.deviceKey,

        // бүх entity-үүд
        sensors,

        // нэгтгэсэн сүүлийн утгууд (Flutter-т шууд ашиглана)
        latestSensor: latest,
      };
    });

    res.json({ ok: true, devices });
  } catch (err) {
    console.error('GET /sites/:siteId/floors/:floorId/devices/card error', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

export default r;
