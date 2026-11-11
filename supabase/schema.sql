-- Colombaire · esquema de la base de datos en Supabase
-- Ejecutar una vez en Supabase → SQL Editor.
--
-- Cada fila guarda el registro completo de la app en `data` (jsonb), así la app puede
-- añadir campos nuevos sin cambiar la base de datos. Las columnas sueltas (nombre, anilla…)
-- se rellenan solas a partir de `data` para poder consultar y ordenar desde Supabase.
-- La seguridad por filas (RLS) hace que cada usuario solo vea y cambie sus propios datos.

create table if not exists public.palomos (
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  id          text   not null,
  data        jsonb  not null default '{}'::jsonb,
  actualizado bigint not null default 0,          -- milisegundos desde 1970 (marca de la app)
  borrado     boolean not null default false,     -- borrado lógico para sincronizar entre móviles
  nombre      text generated always as (data->>'nombre') stored,
  anilla      text generated always as (data->>'anilla') stored,
  sexo        text generated always as (data->>'sexo') stored,
  plumaje     text generated always as (data->>'plumaje') stored,
  padre_id    text generated always as (data->>'padreId') stored,
  madre_id    text generated always as (data->>'madreId') stored,
  primary key (user_id, id)
);

create table if not exists public.resultados (
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  id          text   not null,
  data        jsonb  not null default '{}'::jsonb,
  actualizado bigint not null default 0,
  borrado     boolean not null default false,
  palomo_id   text generated always as (data->>'palomoId') stored,
  prueba      text generated always as (data->>'prueba') stored,
  lugar       text generated always as (data->>'lugar') stored,
  puesto      text generated always as (data->>'puesto') stored,
  anio        text generated always as (data->>'anio') stored,
  primary key (user_id, id)
);

create index if not exists resultados_palomo_idx on public.resultados (user_id, palomo_id);

alter table public.palomos enable row level security;
alter table public.resultados enable row level security;

-- Políticas: cada usuario, solo lo suyo.
drop policy if exists "palomos propios" on public.palomos;
create policy "palomos propios" on public.palomos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "resultados propios" on public.resultados;
create policy "resultados propios" on public.resultados
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
