-- 10 : éditeur visuel des cartes
-- Enregistre la disposition choisie dans l'éditeur : ce qui s'affiche dans chaque zone de la carte,
-- les textes et stickers posés sur la photo, et la hauteur de la bande de tampons.
-- Sans risque : ajoute une seule colonne, vide par défaut (les cartes existantes ne changent pas).
-- À lancer une fois dans Supabase → SQL Editor → New query → Run.

alter table public.loyalty_programs
  add column if not exists card_layout jsonb not null default '{}'::jsonb;
