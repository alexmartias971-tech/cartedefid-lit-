-- 07 : cartes « photo » (bannière en verre dépoli, carte poster iOS 27, photo par niveau)

alter table public.loyalty_programs
  add column if not exists photo_focus text not null default 'center';

alter table public.program_tiers
  add column if not exists image_url text;

alter table public.loyalty_programs drop constraint if exists loyalty_programs_design_check;
alter table public.loyalty_programs add constraint loyalty_programs_design_check check (
  progress_style in ('glass', 'minimal', 'grid', 'collection', 'fill', 'none')
  and stamps_position in ('center', 'right', 'bottom')
  and photo_focus in ('top', 'center', 'bottom')
  and vessel in ('glass', 'cup')
  and signup_bonus between 0 and 1000
  and bonus_multiplier between 1 and 3
  and (bonus_start_hour is null or bonus_start_hour between 0 and 23)
  and (bonus_end_hour is null or bonus_end_hour between 1 and 24)
  and referral_bonus between 0 and 1000
);

-- Les nouvelles cartes utilisent le style photo par défaut
alter table public.loyalty_programs alter column progress_style set default 'glass';
