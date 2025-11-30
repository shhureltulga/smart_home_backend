// src/constants/deviceTypes.js
// ⚠️ Prisma-гийн DeviceType enum-тэй яг 1:1 таарах ёстой.
// Хэрэв танай enum-д 'other' БАЙГАА бол ENV-д DEVICE_TYPE_HAS_OTHER=1 тавь.
const HAS_OTHER        = process.env.DEVICE_TYPE_HAS_OTHER === '1';
const USE_FALLBACK     = process.env.DEVICE_TYPE_USE_FALLBACK === '1';   // өргөн төрлийг ойрын руу шахах (хуучин нийцлийн горим)
const OTHER_TO_SENSOR  = process.env.DEVICE_TYPE_OTHER_TO_SENSOR === '1'; // 'other' байхгүй бол sensor руу шахах

// ====== Зөвшөөрөгдсөн төрлүүд (enum таарах) ======
export const ALLOWED_DEVICE_TYPES = new Set([
  'light','switch','outlet','plug','fan',
  'thermostat','air_conditioner','heater','humidifier','dehumidifier',
  'door_lock','valve','siren','garage_door','cover','curtain','blind',
  'camera','tv','speaker','media_player','remote','button',

  // хөдөлгөөн/хаалт/чичиргээ/уналт
  'motion_sensor','occupancy_sensor','presence_sensor','contact_sensor','vibration_sensor','tilt_sensor',

  // аюулгүй байдал
  'smoke_sensor','gas_sensor','water_leak_sensor','sound_sensor',

  // орчны
  'temperature_sensor','humidity_sensor','pressure_sensor','illuminance_sensor','uv_sensor',
  'co2_sensor','voc_sensor','pm25_sensor','pm10_sensor','wind_sensor','rain_sensor','air_quality_sensor',

  // эрчим хүч
  'power_sensor','energy_sensor','voltage_sensor','current_sensor','battery_sensor',

  // generic
  'binary_sensor','sensor',

  // gateway/bridge
  'coordinator','bridge','gateway',
]);
if (HAS_OTHER) ALLOWED_DEVICE_TYPES.add('other');

// ====== B хувилбар – enum-ээ тэлээгүй үед өргөн төрлүүдийг ойрын руу шахах ======
const MAP_FALLBACK = new Map(
  ['switch','outlet','plug','valve','siren','garage_door','cover','curtain','blind','remote','button','light']
    .map(t => [t, 'light'])
);

// ====== Туслах: зөвшөөрөгдсөн эсэх ======
export function isAllowedDeviceType(t) {
  return ALLOWED_DEVICE_TYPES.has(String(t || '').toLowerCase());
}

/** Хуучин API-тай нийцүүлж үлдээнэ: текстийг зөвшөөрөгдсөн төрөл рүү шахах */
export function coerceDeviceType(input) {
  const t = String(input || '').toLowerCase();
  if (ALLOWED_DEVICE_TYPES.has(t)) return t;
  if (USE_FALLBACK && MAP_FALLBACK.has(t)) return MAP_FALLBACK.get(t);

  // үл мэдэгдэх → 'other' (хэрэв enum-д байхгүй/хаалттай бол sensor руу шахна)
  if (HAS_OTHER && !OTHER_TO_SENSOR) return 'other';
  return 'sensor';
}

/**
 * ШИНЭ: meta (domain/name/model/manufacturer)-оос ухаалаг таамаглана.
 *  - HA/Z2M domain==='climate' → thermostat
 *  - Tuya радиаторууд: TS0601, _TZE204_* → thermostat
 *  - cover домэйн → cover (дэд төрөл нь subType дээрээ яваг)
 *  - switch/outlet → outlet
 *  - Энгийн sensor/binary_sensor боловч тусгай төрөл олдохгүй бол → 'sensor'
 *  - Үл мэдэгдэх бол → 'other' (эсвэл ENV-ээр 'sensor')
 */
export function inferDeviceType(meta = {}) {
  const domain    = String(meta.domain || '').toLowerCase();
  const devClass  = String(meta.deviceClass || '').toLowerCase();
  const name      = String(meta.name || '').toLowerCase();
  const model     = String(meta.model || meta.modelId || '').toLowerCase();
  const mfr       = String(meta.manufacturer || '').toLowerCase();
  const typeHint  = String(meta.type || '').toLowerCase();
  const label     = String(meta.label || '').toLowerCase();
  const sig       = `${name} ${label} ${devClass} ${model} ${mfr}`;

  const has = (re) => re.test(sig);

  /* 1) climate / thermostat төрлүүд */
  if (
    domain === 'climate' ||
    devClass === 'climate' ||
    devClass === 'thermostat' ||
    /thermostat|термостат|radiator/i.test(sig)
  ) {
    return 'thermostat';
  }

  /* 2) Гэрэл */
  if (
    domain === 'light' ||
    devClass.includes('light') ||
    has(/lamp|bulb|downlight|spotlight|ceiling\s*light|гэрэл/iu)
  ) {
    return 'light';
  }

  /* 3) Fan */
  if (domain === 'fan' || devClass.includes('fan')) {
    return 'fan';
  }

  /* 4) Розетка / plug / switch → outlet */
  if (
    domain === 'switch' ||
    domain === 'outlet' ||
    domain === 'plug' ||
    devClass.includes('outlet') ||
    devClass.includes('socket') ||
    has(/socket|plug|outlet|power strip|розетка/iu)
  ) {
    return 'outlet';
  }

  /* 5) Cover / curtain / blind */
  if (domain === 'cover' || devClass === 'cover') {
    if (has(/curtain|гардин|хөшиг|перде/iu)) return 'curtain';
    if (has(/blind|жалюзи/iu)) return 'blind';
    return 'cover';
  }

  /* 6) Аюулгүй байдал – binary_sensor дээр түшиглэе */
  if (domain === 'binary_sensor') {
    // Motion
    if (
      devClass === 'motion' ||
      devClass === 'occupancy' ||
      devClass === 'presence' ||
      has(/motion|occupancy|presence|movement|pir|хөдөлгөөн/iu)
    ) {
      return 'motion_sensor';
    }

    // Contact (door/window)
    if (
      devClass === 'door' ||
      devClass === 'window' ||
      devClass === 'opening' ||
      has(/door|window|contact|хаалга|цонх/iu)
    ) {
      return 'contact_sensor';
    }

    // Vibration / tilt
    if (
      devClass === 'vibration' ||
      devClass === 'tilt' ||
      has(/vibration|tilt|shock/iu)
    ) {
      return 'vibration_sensor';
    }

    // Smoke
    if (
      devClass === 'smoke' ||
      has(/smoke|fire detector|галын дохиолол/iu)
    ) {
      return 'smoke_sensor';
    }

    // Gas
    if (
      devClass === 'gas' ||
      has(/gas|co detector|co\s?2 detector/iu)
    ) {
      return 'gas_sensor';
    }

    // Water leak
    if (
      devClass === 'moisture' ||
      has(/(water leak|leakage|flood sensor|ус алдалт)/iu)
    ) {
      return 'water_leak_sensor';
    }
  }

  /* 7) Орчны сенсор – sensor / binary_sensor domain */
  const isEnvDomain = domain === 'sensor' || domain === 'binary_sensor';

  if (isEnvDomain) {
    // Temperature
    if (devClass === 'temperature' || has(/temperature|temp|температур|хэм/iu)) {
      return 'temperature_sensor';
    }

    // Humidity
    if (devClass === 'humidity' || has(/humidity|rh\b|чийгшил/iu)) {
      return 'humidity_sensor';
    }

    // Pressure
    if (devClass === 'pressure' || has(/pressure|барометр/iu)) {
      return 'pressure_sensor';
    }

    // Illuminance / lux
    if (devClass === 'illuminance' || has(/illuminance|lux| гэрэлтэлт/iu)) {
      return 'illuminance_sensor';
    }

    // UV
    if (devClass === 'uv' || has(/\buv\b/i)) {
      return 'uv_sensor';
    }

    // CO2 / VOC
    if (devClass === 'co2' || has(/\bco2\b/iu)) {
      return 'co2_sensor';
    }
    if (devClass === 'voc' || has(/\bvoc\b|tvoc/iu)) {
      return 'voc_sensor';
    }

    // PM2.5 / PM10
    if (has(/pm ?2\.?5/iu)) return 'pm25_sensor';
    if (has(/pm ?10/iu))    return 'pm10_sensor';

    // Air quality
    if (devClass === 'aqi' || has(/air quality|aqi/iu)) {
      return 'air_quality_sensor';
    }
  }

  /* 8) Эрчим хүчний сенсор */
  if (isEnvDomain || domain === 'switch' || domain === 'outlet' || domain === 'plug') {
    if (devClass === 'power'   || has(/\bpower\b|ватт|w\b/iu))   return 'power_sensor';
    if (devClass === 'energy'  || has(/energy|kwh|кВтц/iu))      return 'energy_sensor';
    if (devClass === 'voltage' || has(/voltage|вольт|v\b/iu))    return 'voltage_sensor';
    if (devClass === 'current' || has(/current|амп|a\b/iu))      return 'current_sensor';
    if (devClass === 'battery' || has(/battery|батерей|akku/iu)) return 'battery_sensor';
  }

  /* 9) Tuya радиатор, thermostat keyword – fallback safety */
  if (/(_tze204_|ts0601|thermostat|термостат|radiator)/iu.test(`${sig} ${typeHint}`)) {
    return 'thermostat';
  }

  /* 10) Cover again as fallback */
  if (domain === 'cover') return 'cover';

  /* 11) Coordinator / bridge / gateway */
  if (domain === 'coordinator' || typeHint === 'coordinator') return 'coordinator';
  if (domain === 'bridge' || domain === 'gateway') return domain;

  // === ШИНЭ ДҮРЭМ ===
  // Энгийн sensor/binary_sensor боловч тусгай төрөл олдсонгүй → 'sensor'
  if (domain === 'sensor' || domain === 'binary_sensor') {
    return 'sensor';
  }

  // Эцсийн fallback: үл танигдсан бүхнийг 'other' (эсвэл ENV-ээр 'sensor') болгоно.
  return coerceDeviceType('other');
}
export function inferDeviceDomain(meta = {}) {
  // 1) Хэрэв HA/Z2M-аас domain шууд ирсэн байвал тэрийг нь хэрэглэнэ
  const explicit = String(meta.domain || '').toLowerCase();
  if (explicit) return explicit;

  const label = String(meta.label || meta.name || '').toLowerCase();
  const typeHint = String(meta.type || meta.deviceClass || '').toLowerCase();
  const sig = `${label} ${typeHint}`;

  // 2) Entities-ээс жинхэнэ HA domain-ийг олно
  const ents = Array.isArray(meta.entities) ? meta.entities : [];
  const domainsFromEntities = new Set();

  for (const e of ents) {
    const id = String(e.entity_id || e.entityId || '').toLowerCase();
    if (!id) continue;
    const dom = id.split('.')[0]; // climate.xxx → climate
    if (dom) domainsFromEntities.add(dom);
  }

  // entity-д climate байвал → заавал climate
  if (domainsFromEntities.has('climate')) return 'climate';
  if (domainsFromEntities.has('light'))   return 'light';
  if (domainsFromEntities.has('fan'))     return 'fan';
  if (domainsFromEntities.has('cover'))   return 'cover';
  if (domainsFromEntities.has('switch'))  return 'switch';
  if (domainsFromEntities.has('sensor'))  return 'sensor';
  if (domainsFromEntities.has('binary_sensor')) return 'sensor';

  // 3) Төрлөөс нь урвуугаар таамаглана
  const t = inferDeviceType(meta);   // дээр чинь байгаа функц
  switch (t) {
    case 'thermostat':
      // паарны термостат → climate домэйн
      return 'climate';
    case 'light':
      return 'light';
    case 'outlet':
      // Zigbee plug ихэнхдээ HA дээр switch домэйнд ордог
      return 'switch';
    case 'fan':
      return 'fan';
    default:
      break;
  }

  // 4) Нэрнээс нь болгоомжтой таамаг (fallback)
  if (/(thermostat|термостат|radiator|паар)/iu.test(sig)) return 'climate';
  if (/(light|bulb|lamp|гэрэл)/iu.test(sig))             return 'light';
  if (/(socket|plug|outlet|розетка)/iu.test(sig))        return 'switch';

  // 5) Default – ердийн мэдрэгч гэж үзье
  return 'sensor';
}