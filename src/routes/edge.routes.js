// src/routes/edge.routes.js
import { Router } from 'express';
import crypto from 'crypto';
import { coerceDeviceType, inferDeviceType, inferDeviceDomain } from '../constants/deviceTypes.js';

const r = Router();

/** HMAC verify (prefix sign-д орохгүй) */
function verifyHmac(req, res, next) {
  try {
    const secret = process.env.EDGE_SHARED_SECRET || 'change-this-very-strong';
    const edgeId = req.get('x-edge-id') || '';
    const ts = req.get('x-timestamp') || '';
    const sig = req.get('x-signature') || '';
    if (!edgeId || !ts || !sig) {
      return res.status(401).json({ ok: false, error: 'missing_hmac_headers' });
    }

    const method = req.method.toUpperCase();
    const path = req.path; // /edge/heartbeat, /edge/ingest, ...
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    const base = `${method}|${path}|${ts}|${bodyHash}`;
    const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
    if (expected !== sig) {
      return res.status(401).json({ ok: false, error: 'invalid_signature' });
    }
    return next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'hmac_error' });
  }
}


async function resolveRoomId(prisma, { householdId, roomId, roomName /*, siteId*/ }) {
  if (roomId) return roomId;
  if (!roomName) return undefined;

  // Хэрэв site-аар хязгаарлах бол дээрээс siteId дамжуулаад where-д нэмж болно.
  const r = await prisma.room.findFirst({
    where: {
      householdId,
      // ...(siteId ? { siteId } : {}),
      name: { equals: roomName, mode: 'insensitive' }, // ← displayName хасаад insensitive болголоо
    },
    select: { id: true },
  });

  return r?.id;
}



/** ---------- 1) Heartbeat ---------- */
r.post('/edge/heartbeat', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;

    const status = req.body?.status === 'offline' ? 'offline' : 'online';
    const edgeIdHeader = req.get('x-edge-id') || '';
    const edgeId = req.body?.edgeId || edgeIdHeader || 'unknown';

    const householdId = req.body?.householdId || '';
    const siteId      = req.body?.siteId || '';

    if (!householdId) return res.status(400).json({ ok: false, error: 'householdId_required' });
    if (!siteId)      return res.status(400).json({ ok: false, error: 'siteId_required' });

    // Site-г заавал олдоно, мөн тухайн household-д харьяалагдах ёстой
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site || site.householdId !== householdId) {
      return res.status(404).json({ ok: false, error: 'site_not_found_or_mismatch' });
    }

    // EdgeNode-г edgeId-аар upsert (schema: householdId, siteId заавал)
    await prisma.edgeNode.upsert({
      where: { edgeId },
      update: {
        householdId,
        siteId,
        status,
        lastSeenAt: new Date(),
      },
      create: {
        edgeId,
        householdId,
        siteId,
        status,
        lastSeenAt: new Date(),
      },
    });

    console.log(`[EDGEHOOKS] heartbeat edge=${edgeId} household=${householdId} site=${siteId} status=${status}`);
    return res.json({ ok: true, edgeId, status });
  } catch (e) {
    console.error('[EDGEHOOKS] heartbeat failed:', e);
    return res.status(500).json({ ok: false, error: 'heartbeat_failed', detail: String(e?.message || e) });
  }
});

r.post('/edge/sensors/latest', verifyHmac, async (req, res) => {
  try {
    const prisma    = req.app.locals.prisma;
    const edgeExtId = req.get('x-edge-id') || '';

    const body        = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const householdId = body.householdId || '';
    const siteId      = body.siteId || '';
    const items       = Array.isArray(body.items) ? body.items : [];

    if (!householdId) {
      return res.status(400).json({ ok: false, error: 'householdId_required' });
    }
    if (!siteId) {
      return res.status(400).json({ ok: false, error: 'siteId_required' });
    }
    if (!items.length) {
      return res.json({ ok: true, upserted: 0 });
    }

    // Site баталгаажуулах
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site || site.householdId !== householdId) {
      return res.status(404).json({ ok: false, error: 'site_not_found_or_mismatch' });
    }

    // EdgeNode баталгаажуулах (байхгүй бол үүсгэнэ)
    let edge = await prisma.edgeNode.findUnique({ where: { edgeId: edgeExtId } });
    if (!edge) {
      edge = await prisma.edgeNode.create({
        data: {
          edgeId: edgeExtId,
          householdId,
          siteId,
          status: 'online',
          lastSeenAt: new Date(),
        },
      });
    } else if (edge.siteId !== siteId || edge.householdId !== householdId) {
      edge = await prisma.edgeNode.update({
        where: { edgeId: edgeExtId },
        data:  { siteId, householdId },
      });
    }

    let upserted = 0;

    for (const it of items) {
      // deviceKey + entityKey + value гурвыг заавал шаардана
      if (!it || !it.deviceKey || !it.entityKey || typeof it.value === 'undefined') continue;

      const deviceKey = String(it.deviceKey);
      const entityKey = String(it.entityKey);        // ← EDGE-ээс ирсэн canonical key (temperature, humidity, ...)

      const value = Number(it.value);
      if (Number.isNaN(value)) continue;

      const ts = it.ts ? new Date(it.ts) : new Date();

      // HA-ийн жинхэнэ entity_id (sensor.xxx) байвал авч хадгална
      const rawEntityId =
        (typeof it.haEntityId === 'string' && it.haEntityId) ||
        (typeof it.entityKey === 'string' ? it.entityKey : '');

      await prisma.latestSensor.upsert({
        where: {
          // Prisma: @@unique([siteId, deviceKey, entityKey])
          siteId_deviceKey_entityKey: {
            siteId,
            deviceKey,
            entityKey,
          },
        },
        update: {
          edgeId:      edge.id,
          type:        it.type ? String(it.type) : null,
          value,
          ts,
          domain:      it.domain ?? null,
          deviceClass: it.deviceClass ?? null,
          unit:        it.unit ?? null,
          stateClass:  it.stateClass ?? null,
          haEntityId:  rawEntityId || null,   // ← ШИНЭ
        },
        create: {
          householdId,
          siteId,
          edgeId:      edge.id,
          deviceKey,
          entityKey,
          haEntityId:  rawEntityId || null,   // ← ШИНЭ
          type:        it.type ? String(it.type) : null,
          value,
          ts,
          domain:      it.domain ?? null,
          deviceClass: it.deviceClass ?? null,
          unit:        it.unit ?? null,
          stateClass:  it.stateClass ?? null,
        },
      });

      upserted++;
    }

    console.log(
      `[EDGEHOOKS] /edge/sensors/latest edge=${edgeExtId} site=${siteId} household=${householdId} upserted=${upserted}`,
    );

    return res.json({ ok: true, upserted });
  } catch (e) {
    console.error('[EDGEHOOKS] /edge/sensors/latest failed:', e);
    return res.status(500).json({
      ok: false,
      error: 'latest_sensors_failed',
      detail: String(e && e.message ? e.message : e),
    });
  }
});

/** ---------- 3) Commands татах ---------- */
r.get('/edge/commands', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const edgeExtId = req.get('x-edge-id') || 'unknown';

    const edge = await prisma.edgeNode.findUnique({ where: { edgeId: edgeExtId } });
    if (!edge) return res.json({ ok: true, commands: [] });

    const cmds = await prisma.edgeCommand.findMany({
      where: { edgeId: edge.id, status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    if (cmds.length > 0) {
      await prisma.edgeCommand.updateMany({
        where: { id: { in: cmds.map((c) => c.id) } },
        data: { status: 'sent', sentAt: new Date() },
      });
    }

    return res.json({ ok: true, commands: cmds.map(c => ({ id: c.id, payload: c.payload })) });
  } catch (e) {
    console.error('[EDGEHOOKS] commands fetch failed:', e);
    return res.status(500).json({ ok: false, error: 'commands_fetch_failed', detail: String(e?.message || e) });
  }
});

/** ---------- 4) Commands ACK ---------- */
// routes/edgehooks.ts (эсвэл хаана байна тэр файл)
r.post('/edge/commands/ack', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const { commandId, status, error } = req.body || {};
    if (!commandId || !status) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    // 🔎 түр оношилгооны лог
    console.log('[ACK handler] body =', JSON.stringify(req.body));

    // meta/result/extra-гаас уянгаараа уншина
    const meta =
      (req.body?.meta   && typeof req.body.meta   === 'object' ? req.body.meta   : null) ??
      (req.body?.result && typeof req.body.result === 'object' ? req.body.result : null) ??
      (req.body?.extra  && typeof req.body.extra  === 'object' ? req.body.extra  : null) ??
      null;

    const updated = await prisma.edgeCommand.update({
      where: { id: commandId },
      data: {
        status: status === 'acked' ? 'acked' : 'failed',
        error: error ?? null,
        ackedAt: new Date(),
        // ackMeta: meta ?? undefined, // хүсвэл Json хэлбэрээр хадгалж болно
      },
      select: { id: true, status: true, error: true },
    });

    // ✅ room.haAreaId-г хадгална (ирсэн бол)
    const roomId   = meta?.roomId ? String(meta.roomId) : null;
    const haAreaId = meta?.haAreaId ? String(meta.haAreaId) : null;
    if (roomId && haAreaId) {
      await prisma.room.update({
        where: { id: roomId },
        data:  { haAreaId },
      });
    }

    return res.json({ ok: true, ...updated });
  } catch (e) {
    console.error('[EDGEHOOKS] commands ack failed:', e);
    return res.status(500).json({ ok: false, error: 'commands_ack_failed', detail: String(e?.message || e) });
  }
});

// rooms sync receiver
// EDGEHOOKS: rooms sync -> queue EdgeCommands for HA
r.post('/rooms', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const { event, siteId, householdId, room, prevName } = req.body || {};
    if (!event || !siteId || !householdId || !room?.id || !room?.name) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    // Site баталгаажуулах
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site || site.householdId !== householdId) {
      return res.status(404).json({ ok: false, error: 'site_not_found_or_mismatch' });
    }

    // Энэ site-д хамаарах бүх EdgeNode
    const edges = await prisma.edgeNode.findMany({
      where: { siteId, householdId },
      select: { id: true },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (edges.length === 0) {
      console.log('[EDGEHOOKS /rooms] no edge nodes for site, skipping queue');
      return res.json({ ok: true, queued: 0 });
    }

    // event -> op map
    let op;
    if (event === 'room.created') op = 'ha.area.ensure';
    else if (event === 'room.updated') op = 'ha.area.rename';
    else if (event === 'room.deleted') op = 'ha.area.delete';
    else return res.status(400).json({ ok: false, error: 'unknown_event' });

    // edge payload
    const payload = {
      op,
      event,
      siteId,
      householdId,
      room: { id: room.id, name: room.name },
      // rename үед хуучин нэрийг дамжуулбал илүү найдвартай
      fromName: prevName || undefined,
      toName: room.name,
      haAreaId: room.haAreaId || null,
      ts: new Date().toISOString(),
    };

    // queue to all edges
    await prisma.edgeCommand.createMany({
      data: edges.map(e => ({
        edgeId: e.id,
        status: 'queued',
        payload,
      })),
    });

    console.log(`[EDGEHOOKS] rooms queued -> ${op} for ${edges.length} edge(s) room=${room.id} "${room.name}"`);
    return res.json({ ok: true, queued: edges.length });
  } catch (e) {
    console.error('[EDGEHOOKS /rooms] error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'rooms_queue_failed' });
  }
});

// src/routes/edge.routes.js - дотор, бусад route-уудын доор

/** ---------- 5) Devices purge (Edge HMAC) ----------
 *  Full URL (гадаад):   /edgehooks/edge/devices/purge
 *  HMAC sign path:      /edge/devices/purge   ← ПРЕФИКС ОРОХГҮЙ!
 */
r.post('/edge/devices/purge', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma; // ← prisma-г scope-д оруулна
    const { siteId, keepKeys } = req.body || {};

    if (!siteId || !Array.isArray(keepKeys)) {
      return res.status(400).json({ ok: false, error: 'bad_request', message: 'siteId, keepKeys required' });
    }

    // Хатуу устгах (hard delete)
    const del = await prisma.device.deleteMany({
      where: {
        siteId,
        deviceKey: { notIn: keepKeys.length ? keepKeys : ['__never__'] },
      },
    });

    // // Хэрэв soft-delete хийх бол дээрхийг комментолж, үүнийг ашигла:
    // const del = await prisma.device.updateMany({
    //   where: {
    //     siteId,
    //     deviceKey: { notIn: keepKeys.length ? keepKeys : ['__never__'] },
    //     deletedAt: null,
    //   },
    //   data: { deletedAt: new Date() },
    // });

    return res.json({ ok: true, deleted: del.count });
  } catch (e) {
    console.error('[EDGEHOOKS /edge/devices/purge] error:', e);
    return res.status(500).json({ ok: false, error: 'server_error', detail: String(e?.message || e) });
  }
});


/** ---------- Device register (Edge HMAC) ----------
 *  Full URL:         /edgehooks/edge/devices/register
 *  HMAC sign path:   /edge/devices/register   ←  PREFIX ОРОХГҮЙ
 */
r.post('/edge/devices/register', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { householdId: bodyHid, siteId: bodySid } = body;

    // Payload-аа normalize
    const list = Array.isArray(body.devices)
      ? body.devices
      : (body.deviceKey || body.device)
        ? [
            body.device || {
              deviceKey: body.deviceKey,
              name: body.name,
              type: body.type,
              domain: body.domain,
              deviceClass: body.deviceClass,
              roomId: body.roomId,
              roomName: body.roomName,
              floorId: body.floorId,
              label: body.label,
              pos: body.pos,
              entities: body.entities || [],
            },
          ]
        : [];

    if (!list.length) {
      return res.json({ ok: true, upserted: 0, entitiesUpserted: 0, devices: [] });
    }

    // Нэг удаагийн хүсэлтийг transaction-аар
    const result = await prisma.$transaction(async (tx) => {
      let devCount = 0;
      let entCount = 0;
      const items = [];

      for (const d of list) {
        // siteId / householdId derive
        const siteId = d.siteId || bodySid;
        if (!siteId) throw new Error('missing_siteId');

        const site = await tx.site.findUnique({
          where: { id: siteId },
          select: { id: true, householdId: true },
        });
        if (!site) throw new Error(`site_not_found:${siteId}`);

        const householdId = bodyHid || site.householdId;
        if (!householdId) throw new Error('missing_householdId');

        // заавал талбарууд
        if (!d.deviceKey || !d.name || !d.type)
          throw new Error(`invalid_device_row: requires { deviceKey, name, type }`);

        // Room resolve
        const resolvedRoomId = await resolveRoomId(tx, {
          householdId,
          roomId: d.roomId,
          roomName: d.roomName,
        });

        // --------------------------
        // ✅ domainHint-г заавал тодорхойлно
        const firstEntity = (d.entities && d.entities[0]) || {};
        const domainHint = String(
          d.domain ||
          d.type ||
          firstEntity.domain ||
          ''
        ).toLowerCase();

        const deviceClass = String(
          firstEntity.device_class ||
          d.deviceClass ||
          ''
        ).toLowerCase();
        // --------------------------

        // Төрөл inference хийх
        const inferred = inferDeviceType({
          domain: domainHint,
          deviceClass,
          name: d.name,
          model: d.modelId || d.model,
          manufacturer: d.manufacturer,
          type: d.type,
          label: d.label,
        });
        const safeType = coerceDeviceType(inferred || d.type);
        const domain = inferDeviceDomain(d);
        // Device upsert
        const device = await tx.device.upsert({
          where: { householdId_deviceKey: { householdId, deviceKey: d.deviceKey } },
          update: {
            siteId,
            name: d.name ?? undefined,
            type: safeType,
            domain: domain,
            deviceClass,
            roomId: resolvedRoomId ?? undefined,
            floorId: d.floorId ?? undefined,
            pos: d.pos ?? undefined,
            label: d.label ?? undefined,
            status: 'online',
            updatedAt: new Date(),
          },
          create: {
            householdId,
            siteId,
            deviceKey: d.deviceKey,
            name: d.name,
            type: safeType,
            domain: domain,
            deviceClass,
            roomId: resolvedRoomId ?? null,
            floorId: d.floorId ?? null,
            pos: d.pos ?? null,
            label: d.label ?? null,
            status: 'online',
            isOn: false,
          },
          select: { id: true, householdId: true, siteId: true, deviceKey: true, name: true, type: true },
        });
        devCount++;

        // Entities upsert
        const entities = Array.isArray(d.entities) ? d.entities : [];
        let perDeviceEnt = 0;

        for (const e of entities) {
          const entityKey = e?.entityKey;
          if (!entityKey) continue;

          await tx.deviceEntity.upsert({
            where: {
              siteId_deviceKey_entityKey: {
                siteId: device.siteId,
                deviceKey: device.deviceKey,
                entityKey,
              },
            },
            update: {
              domain: e.domain ?? null,
              deviceClass: e.deviceClass ?? null,
              unit: e.unit ?? null,
              stateClass: e.stateClass ?? null,
              updatedAt: new Date(),
              deviceId: device.id,
              householdId: device.householdId,
              siteId: device.siteId,
            },
            create: {
              householdId: device.householdId,
              siteId: device.siteId,
              deviceId: device.id,
              deviceKey: device.deviceKey,
              entityKey,
              domain: e.domain ?? null,
              deviceClass: e.deviceClass ?? null,
              unit: e.unit ?? null,
              stateClass: e.stateClass ?? null,
            },
          });
          entCount++;
          perDeviceEnt++;
        }

        items.push({
          deviceKey: device.deviceKey,
          deviceId: device.id,
          entitiesUpserted: perDeviceEnt,
        });
      }

      return { devCount, entCount, items };
    });

    return res.json({
      ok: true,
      upserted: result.devCount,
      entitiesUpserted: result.entCount,
      devices: result.items,
    });
  } catch (e) {
    console.error('[EDGEHOOKS /devices/register] error:', e);
    return res.status(500).json({ ok: false, error: 'upsert_failed', detail: String(e?.message || e) });
  }
});


// ---------- 6) Device Entities register (Edge HMAC) ----------
// Full URL:   /edgehooks/edge/devices/entities/register
// edge.routes.js доторх entities register HANDLER-ИЙГ бүрэн солино
r.post('/edge/devices/entities/register', verifyHmac, async (req, res) => {
  try {
    const prisma = req.app.locals.prisma;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const householdId = body.householdId || '';
    const siteId      = body.siteId || '';
    const items       = Array.isArray(body.items) ? body.items : [];

    if (!householdId || !siteId) {
      return res.status(400).json({ ok:false, error:'missing_household_or_site' });
    }
    if (items.length === 0) {
      return res.json({ ok:true, upserted:0, entities:[] });
    }

    console.log('[EDGEHOOKS] POST /edge/devices/entities/register',
      'siteId=', siteId, 'count=', items.length);

    const results = [];

    for (const it of items) {               // ← ЗӨВХӨН `it`-г ашиглана
      try {
        if (!it || !it.deviceKey || !it.entityKey || !it.domain) {
          results.push({ ok:false, error:'missing_required_fields(deviceKey|entityKey|domain)', raw: it ?? null });
          continue;
        }

        const dev = await prisma.device.findUnique({
          where: { householdId_deviceKey: { householdId, deviceKey: String(it.deviceKey) } },
          select: { id: true },
        });

        const up = await prisma.deviceEntity.upsert({
          where: {
            siteId_deviceKey_entityKey: {
              siteId,
              deviceKey: String(it.deviceKey),
              entityKey: String(it.entityKey),
            },
          },
          update: {
            householdId,
            siteId,
            deviceId: dev?.id ?? null,
            deviceKey: String(it.deviceKey),
            entityKey: String(it.entityKey),
            domain: it.domain ?? null,
            deviceClass: it.deviceClass ?? null,
            unit: it.unit ?? null,
            stateClass: it.stateClass ?? null,
            capabilities: it.capabilities ?? null,
            haEntityId: it.haEntityId ?? String(it.entityKey),
            updatedAt: new Date(),
          },
          create: {
            id: crypto.randomUUID(),
            householdId,
            siteId,
            deviceId: dev?.id ?? null,
            deviceKey: String(it.deviceKey),
            entityKey: String(it.entityKey),
            domain: it.domain ?? null,
            deviceClass: it.deviceClass ?? null,
            unit: it.unit ?? null,
            stateClass: it.stateClass ?? null,
            capabilities: it.capabilities ?? null,
            haEntityId: it.haEntityId ?? String(it.entityKey),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          select: { id:true, entityKey:true, deviceKey:true },
        });

        results.push({ ok:true, ...up });
      } catch (e) {
        console.error('[EDGEHOOKS /entities/register] item failed:', e);
        results.push({ ok:false, error:'entity_upsert_failed', detail:String(e?.message || e) });
      }
    }

    return res.json({ ok:true, upserted: results.filter(x => x.ok).length, entities: results });
  } catch (e) {
    console.error('[EDGEHOOKS /edge/devices/entities/register] error:', e);
    return res.status(500).json({ ok:false, error:'entity_upsert_failed', detail:String(e?.message || e) });
  }
});



export default r;
