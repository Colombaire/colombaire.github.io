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

-- Cría: una fila por nidada (pareja + puesta, con sus huevos y pichones dentro de `data`).
create table if not exists public.nidadas (
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  id          text   not null,
  data        jsonb  not null default '{}'::jsonb,
  actualizado bigint not null default 0,
  borrado     boolean not null default false,
  macho_id    text generated always as (data->>'machoId') stored,
  hembra_id   text generated always as (data->>'hembraId') stored,
  anio        text generated always as (data->>'anio') stored,
  primary key (user_id, id)
);
create index if not exists nidadas_pareja_idx on public.nidadas (user_id, macho_id, hembra_id);

alter table public.palomos enable row level security;
alter table public.resultados enable row level security;
alter table public.nidadas enable row level security;

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

drop policy if exists "nidadas propias" on public.nidadas;
create policy "nidadas propias" on public.nidadas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Límites por usuario (protegen el espacio del plan frente a abusos o errores; ejecutar una vez).
-- Cada registro puede pesar hasta 1 MB (una foto ya reducida ocupa unos 100-300 KB) y cada cuenta
-- puede tener hasta 5.000 palomos, 10.000 nidadas y 20.000 resultados (incluidos los borrados que se sincronizan).
alter table public.palomos   drop constraint if exists palomos_tamano_max;
alter table public.palomos   add  constraint palomos_tamano_max   check (pg_column_size(data) <= 1000000);
alter table public.resultados drop constraint if exists resultados_tamano_max;
alter table public.resultados add  constraint resultados_tamano_max check (pg_column_size(data) <= 1000000);
alter table public.nidadas   drop constraint if exists nidadas_tamano_max;
alter table public.nidadas   add  constraint nidadas_tamano_max   check (pg_column_size(data) <= 1000000);

create or replace function public.limitar_filas() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare maximo int := case tg_table_name when 'palomos' then 5000 when 'nidadas' then 10000 else 20000 end;
        filas int; ya boolean;
begin
  -- Cambiar una fila que ya existe nunca se rechaza; solo se frena la creación de filas nuevas.
  execute format('select exists (select 1 from public.%I where user_id = $1 and id = $2)', tg_table_name) into ya using new.user_id, new.id;
  if ya then return new; end if;
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into filas using new.user_id;
  if filas >= maximo then raise exception 'Se ha alcanzado el límite de % registros de esta cuenta', maximo using errcode = 'check_violation'; end if;
  return new;
end $$;

drop trigger if exists palomos_limite on public.palomos;
create trigger palomos_limite before insert on public.palomos for each row execute function public.limitar_filas();
drop trigger if exists nidadas_limite on public.nidadas;
create trigger nidadas_limite before insert on public.nidadas for each row execute function public.limitar_filas();
drop trigger if exists resultados_limite on public.resultados;
create trigger resultados_limite before insert on public.resultados for each row execute function public.limitar_filas();

-- ---------------------------------------------------------------------------------------------
-- Borrar la propia cuenta y todos sus datos (derecho al olvido). Solo borra al usuario que llama:
-- las filas de `palomos` y `resultados` se van solas (on delete cascade).
create or replace function public.borrar_mi_cuenta() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;
