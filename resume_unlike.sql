-- =====================================================================
-- resume_unlike.sql : 방문자가 자기가 누른 좋아요를 취소할 수 있게 하기
--
-- 사용법
--   resume.sql 을 이미 실행한 Supabase 에서, SQL Editor 에 전체를 붙여 넣고 Run 한다.
--   (몇 번 실행해도 오류 없음. 이미 있는 좋아요 숫자는 그대로 남는다.)
--
-- 하는 일
--   1) 좋아요 표에서 브라우저 번호(client_id)를 방문자가 못 읽게 숨긴다.
--      (숫자 세기에 필요한 id, project_id, created_at 만 보인다)
--   2) "이 카드 + 이 브라우저 번호" 가 맞는 좋아요 한 줄만 지우는 함수 resume_unlike 를 만든다.
--      번호를 모르면 남의 좋아요는 지울 수 없다.
--   방문자에게 likes 표를 직접 지우는 권한은 여전히 주지 않는다.
-- =====================================================================

-- 1. client_id 숨기기 : 표 전체 읽기를 빼고, 필요한 칸만 읽게 한다
revoke select on public.likes from anon, authenticated;
grant select (id, project_id, created_at) on public.likes to anon, authenticated;

-- 2. 좋아요 취소 함수 : 지웠으면 true, 지울 줄이 없었으면 false
create or replace function public.resume_unlike(p_project_id bigint, p_client_id text)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  with gone as (
    delete from public.likes
    where project_id = p_project_id
      and client_id = p_client_id
    returning 1
  )
  select exists (select 1 from gone);
$$;

revoke all on function public.resume_unlike(bigint, text) from public;
grant execute on function public.resume_unlike(bigint, text) to anon, authenticated;
