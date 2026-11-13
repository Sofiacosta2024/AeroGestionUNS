-- Completa el esquema de contingencias requerido por el motor de reasignación.
-- En bases que ya tienen estas columnas, conserva las definiciones y los datos.
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "vuelo_original_id" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "respuesta_pasajero" VARCHAR(20) DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS "propuesta_motivo" VARCHAR(200);
