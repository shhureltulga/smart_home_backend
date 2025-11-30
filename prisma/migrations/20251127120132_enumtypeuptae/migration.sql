/*
  Warnings:

  - The values [plug,curtain,blind,garage_door] on the enum `DeviceType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."DeviceType_new" AS ENUM ('light', 'switch', 'outlet', 'fan', 'cover', 'door_lock', 'valve', 'siren', 'irrigation', 'air_conditioner', 'thermostat', 'heater', 'humidifier', 'dehumidifier', 'media_player', 'tv', 'speaker', 'camera', 'doorbell', 'sensor', 'binary_sensor', 'unknown', 'motion_sensor', 'occupancy_sensor', 'presence_sensor', 'contact_sensor', 'vibration_sensor', 'tilt_sensor', 'smoke_sensor', 'gas_sensor', 'water_leak_sensor', 'sound_sensor', 'temperature_sensor', 'humidity_sensor', 'pressure_sensor', 'illuminance_sensor', 'uv_sensor', 'co2_sensor', 'voc_sensor', 'pm25_sensor', 'pm10_sensor', 'wind_sensor', 'rain_sensor', 'air_quality_sensor', 'power_sensor', 'energy_sensor', 'voltage_sensor', 'current_sensor', 'battery_sensor', 'button', 'remote', 'gateway', 'bridge', 'coordinator');
ALTER TABLE "public"."Device" ALTER COLUMN "type" TYPE "public"."DeviceType_new" USING ("type"::text::"public"."DeviceType_new");
ALTER TYPE "public"."DeviceType" RENAME TO "DeviceType_old";
ALTER TYPE "public"."DeviceType_new" RENAME TO "DeviceType";
DROP TYPE "public"."DeviceType_old";
COMMIT;
