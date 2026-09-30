-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PASAJERO', 'MOSTRADOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DNI', 'PASAPORTE', 'CEDULA', 'OTRO');

-- CreateEnum
CREATE TYPE "CabinClass" AS ENUM ('ECONOMY', 'PREMIUM', 'BUSINESS', 'FIRST');

-- CreateEnum
CREATE TYPE "AircraftStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "FlightStatus" AS ENUM ('SCHEDULED', 'BOARDING', 'DEPARTED', 'ARRIVED', 'CANCELLED', 'DELAYED');

-- CreateEnum
CREATE TYPE "SeatType" AS ENUM ('WINDOW', 'AISLE', 'MIDDLE', 'EXIT');

-- CreateEnum
CREATE TYPE "DemandLevel" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('ROUND_TRIP', 'ONE_WAY');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'BOARDED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'CASH', 'WALLET');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('NOT_STARTED', 'OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "BaggageType" AS ENUM ('CABIN', 'HOLD', 'CARGO', 'SPECIAL');

-- CreateEnum
CREATE TYPE "BaggageStatus" AS ENUM ('REGISTERED', 'CHECKED', 'LOADED', 'DELIVERED', 'LOST');

-- CreateEnum
CREATE TYPE "BoardingPassStatus" AS ENUM ('ISSUED', 'USED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PASAJERO',
    "legajo" TEXT,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(32),
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(256),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "iataCode" CHAR(3) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "province" VARCHAR(80),
    "country" VARCHAR(80) NOT NULL DEFAULT 'Argentina',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("iataCode")
);

-- CreateTable
CREATE TABLE "aircraft" (
    "id" TEXT NOT NULL,
    "registration" VARCHAR(12) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "manufacturer" VARCHAR(80) NOT NULL,
    "seat_count" INTEGER NOT NULL DEFAULT 150,
    "layout" VARCHAR(120),
    "has_wifi" BOOLEAN NOT NULL DEFAULT false,
    "has_usb_power" BOOLEAN NOT NULL DEFAULT false,
    "image_url" TEXT,
    "status" "AircraftStatus" NOT NULL DEFAULT 'ACTIVE',
    "base_airport_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seats" (
    "id" TEXT NOT NULL,
    "aircraft_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "column_letter" CHAR(1) NOT NULL,
    "cabin_class" "CabinClass" NOT NULL DEFAULT 'ECONOMY',
    "type" "SeatType" NOT NULL DEFAULT 'AISLE',
    "is_exit_row" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "origin_airport_id" CHAR(3) NOT NULL,
    "destination_airport_id" CHAR(3) NOT NULL,
    "distance_km" INTEGER,
    "duration_minutes" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flights" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "route_id" TEXT NOT NULL,
    "aircraft_id" TEXT NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "FlightStatus" NOT NULL DEFAULT 'SCHEDULED',
    "is_direct" BOOLEAN NOT NULL DEFAULT true,
    "punctuality_pct" DECIMAL(5,2),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fares" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "cabin_class" "CabinClass" NOT NULL DEFAULT 'ECONOMY',
    "base_price" DECIMAL(12,2) NOT NULL,
    "carry_on_kg" INTEGER NOT NULL DEFAULT 8,
    "checked_bag_kg" INTEGER NOT NULL DEFAULT 0,
    "change_allowed" BOOLEAN NOT NULL DEFAULT false,
    "seat_selection" BOOLEAN NOT NULL DEFAULT false,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_fares" (
    "id" TEXT NOT NULL,
    "flight_id" TEXT NOT NULL,
    "fare_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "available_seats" INTEGER NOT NULL DEFAULT 150,
    "currency" CHAR(3) NOT NULL DEFAULT 'ARS',

    CONSTRAINT "flight_fares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_fares" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "demand_level" "DemandLevel" NOT NULL DEFAULT 'NORMAL',
    "currency" CHAR(3) NOT NULL DEFAULT 'ARS',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "weekly_fares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "document_type" "DocumentType" NOT NULL DEFAULT 'DNI',
    "document_number" VARCHAR(32) NOT NULL,
    "birth_date" DATE,
    "nationality" VARCHAR(64),
    "email" VARCHAR(160),
    "phone" VARCHAR(32),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "booking_code" VARCHAR(12) NOT NULL,
    "user_id" TEXT,
    "trip_type" "TripType" NOT NULL DEFAULT 'ONE_WAY',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "passengers_count" INTEGER NOT NULL DEFAULT 1,
    "cabin_class" "CabinClass" NOT NULL DEFAULT 'ECONOMY',
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'ARS',
    "contact_email" VARCHAR(160) NOT NULL,
    "contact_phone" VARCHAR(32),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_flights" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "flight_id" TEXT NOT NULL,
    "fare_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "is_return" BOOLEAN NOT NULL DEFAULT false,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_passengers" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "passenger_id" TEXT,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "document_type" "DocumentType" NOT NULL DEFAULT 'DNI',
    "document_number" VARCHAR(32) NOT NULL,
    "birth_date" DATE,
    "seat_id" TEXT,
    "check_in_code" VARCHAR(12),
    "check_in_status" "CheckInStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'ARS',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transaction_ref" VARCHAR(64),
    "installments" INTEGER,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baggage" (
    "id" TEXT NOT NULL,
    "booking_passenger_id" TEXT NOT NULL,
    "tag_code" VARCHAR(16) NOT NULL,
    "type" "BaggageType" NOT NULL DEFAULT 'HOLD',
    "weight_kg" DECIMAL(6,2),
    "status" "BaggageStatus" NOT NULL DEFAULT 'REGISTERED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "baggage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boarding_passes" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "booking_passenger_id" TEXT NOT NULL,
    "seat_id" TEXT,
    "flight_code" VARCHAR(10) NOT NULL,
    "status" "BoardingPassStatus" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boarding_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_legajo_key" ON "users"("legajo");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "aircraft_registration_key" ON "aircraft"("registration");

-- CreateIndex
CREATE INDEX "aircraft_base_airport_id_idx" ON "aircraft"("base_airport_id");

-- CreateIndex
CREATE INDEX "aircraft_status_idx" ON "aircraft"("status");

-- CreateIndex
CREATE INDEX "seats_aircraft_id_cabin_class_idx" ON "seats"("aircraft_id", "cabin_class");

-- CreateIndex
CREATE UNIQUE INDEX "seats_aircraft_id_row_number_column_letter_key" ON "seats"("aircraft_id", "row_number", "column_letter");

-- CreateIndex
CREATE UNIQUE INDEX "routes_code_key" ON "routes"("code");

-- CreateIndex
CREATE INDEX "routes_origin_airport_id_destination_airport_id_idx" ON "routes"("origin_airport_id", "destination_airport_id");

-- CreateIndex
CREATE INDEX "routes_is_active_idx" ON "routes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "flights_code_key" ON "flights"("code");

-- CreateIndex
CREATE INDEX "flights_route_id_departure_at_idx" ON "flights"("route_id", "departure_at");

-- CreateIndex
CREATE INDEX "flights_departure_at_idx" ON "flights"("departure_at");

-- CreateIndex
CREATE INDEX "flights_status_idx" ON "flights"("status");

-- CreateIndex
CREATE INDEX "flights_aircraft_id_idx" ON "flights"("aircraft_id");

-- CreateIndex
CREATE UNIQUE INDEX "fares_code_key" ON "fares"("code");

-- CreateIndex
CREATE INDEX "fares_is_active_idx" ON "fares"("is_active");

-- CreateIndex
CREATE INDEX "flight_fares_fare_id_idx" ON "flight_fares"("fare_id");

-- CreateIndex
CREATE UNIQUE INDEX "flight_fares_flight_id_fare_id_key" ON "flight_fares"("flight_id", "fare_id");

-- CreateIndex
CREATE INDEX "weekly_fares_date_idx" ON "weekly_fares"("date");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_fares_route_id_date_key" ON "weekly_fares"("route_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "passengers_user_id_key" ON "passengers"("user_id");

-- CreateIndex
CREATE INDEX "passengers_last_name_first_name_idx" ON "passengers"("last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "passengers_document_type_document_number_key" ON "passengers"("document_type", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_code_key" ON "bookings"("booking_code");

-- CreateIndex
CREATE INDEX "bookings_user_id_idx" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_created_at_idx" ON "bookings"("created_at");

-- CreateIndex
CREATE INDEX "booking_flights_booking_id_idx" ON "booking_flights"("booking_id");

-- CreateIndex
CREATE INDEX "booking_flights_flight_id_idx" ON "booking_flights"("flight_id");

-- CreateIndex
CREATE INDEX "booking_passengers_booking_id_idx" ON "booking_passengers"("booking_id");

-- CreateIndex
CREATE INDEX "booking_passengers_passenger_id_idx" ON "booking_passengers"("passenger_id");

-- CreateIndex
CREATE INDEX "booking_passengers_seat_id_idx" ON "booking_passengers"("seat_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_ref_key" ON "payments"("transaction_ref");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "baggage_tag_code_key" ON "baggage"("tag_code");

-- CreateIndex
CREATE INDEX "baggage_booking_passenger_id_idx" ON "baggage"("booking_passenger_id");

-- CreateIndex
CREATE INDEX "baggage_status_idx" ON "baggage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "boarding_passes_code_key" ON "boarding_passes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "boarding_passes_booking_passenger_id_key" ON "boarding_passes"("booking_passenger_id");

-- CreateIndex
CREATE INDEX "boarding_passes_flight_code_idx" ON "boarding_passes"("flight_code");

-- CreateIndex
CREATE INDEX "boarding_passes_status_idx" ON "boarding_passes"("status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_base_airport_id_fkey" FOREIGN KEY ("base_airport_id") REFERENCES "airports"("iataCode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_origin_airport_id_fkey" FOREIGN KEY ("origin_airport_id") REFERENCES "airports"("iataCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_destination_airport_id_fkey" FOREIGN KEY ("destination_airport_id") REFERENCES "airports"("iataCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_aircraft_id_fkey" FOREIGN KEY ("aircraft_id") REFERENCES "aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_fares" ADD CONSTRAINT "flight_fares_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_fares" ADD CONSTRAINT "flight_fares_fare_id_fkey" FOREIGN KEY ("fare_id") REFERENCES "fares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_fares" ADD CONSTRAINT "weekly_fares_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_flights" ADD CONSTRAINT "booking_flights_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_flights" ADD CONSTRAINT "booking_flights_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_flights" ADD CONSTRAINT "booking_flights_fare_id_fkey" FOREIGN KEY ("fare_id") REFERENCES "fares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baggage" ADD CONSTRAINT "baggage_booking_passenger_id_fkey" FOREIGN KEY ("booking_passenger_id") REFERENCES "booking_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boarding_passes" ADD CONSTRAINT "boarding_passes_booking_passenger_id_fkey" FOREIGN KEY ("booking_passenger_id") REFERENCES "booking_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boarding_passes" ADD CONSTRAINT "boarding_passes_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

