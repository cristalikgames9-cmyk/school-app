-- Выполнить один раз в Supabase SQL Editor ДО публикации новой версии сайта.
-- Скрипт не удаляет существующие данные и безопасен при повторном запуске.

alter table public.users add column if not exists student_name text;
alter table public.users add column if not exists parent_email text;
alter table public.users add column if not exists newsletter_subscribed boolean default false;
alter table public.users add column if not exists marketing_consent boolean not null default false;
alter table public.users add column if not exists marketing_consent_at timestamptz;
alter table public.users add column if not exists marketing_consent_ip text;

alter table public.users add column if not exists progress_month text;
alter table public.users add column if not exists lessons_completed_month integer not null default 0;
alter table public.users add column if not exists tasks_answered_month integer not null default 0;
alter table public.users add column if not exists correct_month integer not null default 0;
alter table public.users add column if not exists partial_month integer not null default 0;
alter table public.users add column if not exists incorrect_month integer not null default 0;
alter table public.users add column if not exists score_month integer not null default 0;
alter table public.users add column if not exists progress_synced_at timestamptz;
alter table public.users add column if not exists mailerlite_synced_at timestamptz;
alter table public.users add column if not exists mailerlite_sync_error text;

-- Перенос согласия из первой локальной версии интеграции. Новая версия
-- продолжает обновлять newsletter_subscribed для обратной совместимости.
update public.users
set marketing_consent = true,
    marketing_consent_at = coalesce(marketing_consent_at, now())
where newsletter_subscribed = true;

update public.users
set student_name = username
where student_name is null or btrim(student_name) = '';

alter table public.homework_results add column if not exists created_at timestamptz;
-- Для старых ответов точная дата неизвестна. Не записываем их в текущий
-- месяц искусственно; они сохраняются в общем прогрессе как исторические.
update public.homework_results set created_at = '1970-01-01 00:00:00+00' where created_at is null;
alter table public.homework_results alter column created_at set default now();
alter table public.homework_results alter column created_at set not null;

-- Ответ фиксируется один раз. Это также не даёт изменить оценку прямым API-запросом.
create unique index if not exists homework_results_user_lesson_question_uidx
  on public.homework_results (user_id, lesson_id, question_id);

create index if not exists homework_results_user_created_at_idx
  on public.homework_results (user_id, created_at desc);

comment on column public.users.progress_month is 'Календарный месяц отчёта в формате YYYY-MM';
comment on column public.users.score_month is 'Оценка 0–100: correct=1, partial=0.5, incorrect=0';
