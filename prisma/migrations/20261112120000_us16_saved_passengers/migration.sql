-- US-16: agenda de pasajeros guardados por cuenta (hasta 20).
-- Aditiva: solo crea la tabla nueva; no toca datos existentes.

-- CreateTable
CREATE TABLE "saved_passengers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "document_type" "DocumentType" NOT NULL DEFAULT 'DNI',
    "document_number" VARCHAR(32) NOT NULL,
    "birth_date" DATE,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_passengers_user_id_document_type_document_number_key" ON "saved_passengers"("user_id", "document_type", "document_number");

-- CreateIndex
CREATE INDEX "saved_passengers_user_id_last_used_at_idx" ON "saved_passengers"("user_id", "last_used_at");

-- AddForeignKey
ALTER TABLE "saved_passengers" ADD CONSTRAINT "saved_passengers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
