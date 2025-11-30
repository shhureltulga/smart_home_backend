-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."DeviceType" ADD VALUE 'switch';
ALTER TYPE "public"."DeviceType" ADD VALUE 'outlet';
ALTER TYPE "public"."DeviceType" ADD VALUE 'plug';
ALTER TYPE "public"."DeviceType" ADD VALUE 'cover';
ALTER TYPE "public"."DeviceType" ADD VALUE 'curtain';
ALTER TYPE "public"."DeviceType" ADD VALUE 'blind';
ALTER TYPE "public"."DeviceType" ADD VALUE 'garage_door';
ALTER TYPE "public"."DeviceType" ADD VALUE 'valve';
ALTER TYPE "public"."DeviceType" ADD VALUE 'siren';
ALTER TYPE "public"."DeviceType" ADD VALUE 'irrigation';
ALTER TYPE "public"."DeviceType" ADD VALUE 'heater';
ALTER TYPE "public"."DeviceType" ADD VALUE 'humidifier';
ALTER TYPE "public"."DeviceType" ADD VALUE 'dehumidifier';
ALTER TYPE "public"."DeviceType" ADD VALUE 'media_player';
ALTER TYPE "public"."DeviceType" ADD VALUE 'speaker';
ALTER TYPE "public"."DeviceType" ADD VALUE 'doorbell';
ALTER TYPE "public"."DeviceType" ADD VALUE 'binary_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'motion_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'occupancy_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'presence_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'contact_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'vibration_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'tilt_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'smoke_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'gas_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'water_leak_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'sound_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'temperature_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'humidity_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'pressure_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'illuminance_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'uv_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'co2_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'voc_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'pm25_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'pm10_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'wind_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'rain_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'air_quality_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'power_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'energy_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'voltage_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'current_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'battery_sensor';
ALTER TYPE "public"."DeviceType" ADD VALUE 'button';
ALTER TYPE "public"."DeviceType" ADD VALUE 'remote';
ALTER TYPE "public"."DeviceType" ADD VALUE 'gateway';
ALTER TYPE "public"."DeviceType" ADD VALUE 'bridge';
ALTER TYPE "public"."DeviceType" ADD VALUE 'coordinator';
