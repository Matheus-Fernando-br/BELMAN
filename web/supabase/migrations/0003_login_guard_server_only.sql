-- A trava de login passa a ser chamada só pelo servidor do Studio (chave secreta),
-- não mais por qualquer um com a chave pública.
revoke execute on function public.studio_login_locked_until(text), public.studio_record_login(text, boolean) from anon, authenticated;
grant execute on function public.studio_login_locked_until(text), public.studio_record_login(text, boolean) to service_role;
