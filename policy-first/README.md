# 政見，先於人選｜互動新聞原型

公開頁面：https://mirrororc.github.io/policy-first/

## 狀態
- 頁面已部署到 GitHub Pages。
- 問卷與個人圖表可展示。
- **只有完成下面 Supabase 設定並將公開連線資訊填入 index.html 後，才能跨訪客儲存與彙總。**
- 目前題目、候選人與政黨全部都是虛構的示範內容；請勿誤認為真實選舉資料。

## Supabase 設定步驟
1. 建立 Supabase Free 專案。
2. 開啟 SQL Editor，執行下列 SQL。
3. 在 Project Settings / API Keys 取得專案 URL 與 **publishable** key。
4. 在 `policy-first/index.html` 設定 `SUPABASE_URL` 與 `SUPABASE_PUBLISHABLE_KEY`。
5. 以兩支不同裝置填答，確認結果資料庫筆數增加且群體統計更新。不要將 secret / service_role key 放入瀏覽器。

## 資料庫 SQL
```sql
create or replace function public.valid_policy_answers(a jsonb)
returns boolean language sql immutable as $$
 select coalesce(
   jsonb_typeof(a) = 'array'
   and jsonb_array_length(a) = 6
   and (select bool_and(
     case when jsonb_typeof(v) = 'number'
       then (v::text)::numeric between 1 and 5
         and (v::text)::numeric = trunc((v::text)::numeric)
       else false end)
      from jsonb_array_elements(a) as x(v)),
 false);
$$;

create table if not exists public.policy_responses (
 id uuid primary key default gen_random_uuid(),
 survey_id text not null,
 answers jsonb not null,
 created_at timestamptz not null default now(),
 constraint answers_valid check (public.valid_policy_answers(answers)),
 constraint survey_valid check (survey_id = 'policy-first-demo-v1')
);

alter table public.policy_responses enable row level security;
revoke all on public.policy_responses from public, anon, authenticated;
grant insert on public.policy_responses to anon;
create policy "public can submit only valid demo responses"
 on public.policy_responses for insert to anon
 with check (survey_id = 'policy-first-demo-v1' and public.valid_policy_answers(answers));

-- Public users cannot SELECT individual answers. Only aggregated statistics are exposed.
create or replace view public.policy_response_summary as
 select r.survey_id,
        (q.ordinality - 1)::integer as question_index,
        count(*)::bigint as response_count,
        round(avg(q.score::numeric),3) as avg_score
 from public.policy_responses r,
 lateral jsonb_array_elements_text(r.answers) with ordinality as q(score, ordinality)
 group by r.survey_id, q.ordinality;

revoke all on public.policy_response_summary from public, anon, authenticated;
grant select on public.policy_response_summary to anon;
```

## 限制與下一步
- 匿名寫入缺乏防機器人措施；此版本適合封閉小規模測試，**不適合直接作為正式選舉民調**。
- 同一位使用者可重複提交，結果是「提交次數」而非唯一受訪者數。
- 資料庫只供公開彙總，不提供單筆作答公開讀取。
- 管理者可在 Supabase 後台匯出、刪除資料；正式版應加入驗證、頻率限制及管理流程。
- 未啟用即時 WebSocket；目前在完成提交後向伺服器讀取最新群體結果，後續可增加 Realtime。
- 正式版需要明確的資料蒐集告知、取樣與題目設計、政見查證、日期與來源。
