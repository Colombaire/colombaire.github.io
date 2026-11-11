// Conexión con Supabase (base de datos en internet).
// Datos del proyecto: Supabase → Project Settings → API.
//  - supabaseUrl: «Project URL» (sin /rest/v1 al final).
//  - supabaseAnonKey: la clave pública «publishable» (antes «anon»). Está pensada para ir en la app;
//    la seguridad la ponen las políticas RLS de supabase/schema.sql. Nunca poner aquí la clave secreta.
// Sin estos datos la app no puede abrirse: la cuenta es obligatoria.
window.MI_PALOMAR_CONFIG = {
  supabaseUrl: 'https://vgcchlubmqgvfiqkvqiq.supabase.co',
  supabaseAnonKey: 'sb_publishable_3WiPomSx_NSY5U97TLYUmQ_HtZrxNsc',
};
