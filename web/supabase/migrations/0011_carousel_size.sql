-- Quantidade de imagens do carrossel escolhida pelo usuário (null = a IA decide, 9 a 11).
alter table public.content_rules add column if not exists images int check (images is null or images between 4 and 10);
