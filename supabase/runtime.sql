ALTER TABLE public.sports_naklang3_matches ADD COLUMN tie_winner text CHECK(tie_winner IN ('home','away'));
CREATE TABLE public.sports_naklang3_runtime (
 import_id uuid PRIMARY KEY REFERENCES public.sports_naklang3_imports(id),
 version bigint NOT NULL DEFAULT 1,
 config jsonb NOT NULL,
 admin_key_hash text NOT NULL CHECK(length(admin_key_hash)=64)
);
ALTER TABLE public.sports_naklang3_runtime ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sports_naklang3_runtime FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sports_naklang3_runtime TO service_role;
CREATE POLICY sports_naklang3_runtime_service ON public.sports_naklang3_runtime FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY sports_naklang3_imports_service ON public.sports_naklang3_imports FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.sports_naklang3_snapshot(p_import_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('version',r.version,'config',r.config,'admin_key_hash',r.admin_key_hash,
 'events',(SELECT jsonb_agg(jsonb_build_object('id',e.id,'sport',e.sport,'level',e.level,'type',e.type)) FROM public.sports_naklang3_events e WHERE e.import_id=p_import_id),
 'teams',(SELECT jsonb_agg(to_jsonb(t)) FROM public.sports_naklang3_teams t WHERE t.import_id=p_import_id),
 'matches',(SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',m.id,'eventId',m.event_id,'day',m.day,'start',to_char(m.start_time,'HH24:MI'),
 'durationMinutes',m.duration_minutes,'sport',e.sport,'level',e.level,'type',e.type,'field',m.field_id,
 'home',m.home_label,'away',m.away_label,'stage',CASE m.stage WHEN 'round_robin' THEN 'league' ELSE m.stage END,
 'group',coalesce(m.group_code,''),'homeScore',coalesce(to_jsonb(m.home_score),'""'::jsonb),
 'awayScore',coalesce(to_jsonb(m.away_score),'""'::jsonb),'published',m.published,'tieWinner',coalesce(m.tie_winner,''),'scoreSets',m.score_sets
 ) ORDER BY m.day,m.start_time,m.id),'[]'::jsonb)
 FROM public.sports_naklang3_matches m JOIN public.sports_naklang3_events e ON e.import_id=m.import_id AND e.id=m.event_id WHERE m.import_id=p_import_id))
 FROM public.sports_naklang3_runtime r WHERE r.import_id=p_import_id;
$fn$;
CREATE FUNCTION public.sports_naklang3_commit(p_import_id uuid,p_version bigint,p_config jsonb,p_matches jsonb,p_teams jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE current_version bigint;
BEGIN
 SELECT version INTO current_version FROM public.sports_naklang3_runtime WHERE import_id=p_import_id FOR UPDATE;
 IF current_version IS DISTINCT FROM p_version THEN RETURN false; END IF;
 INSERT INTO public.sports_naklang3_matches
 (import_id,id,event_id,day,start_time,end_time,duration_minutes,stage,stage_name,group_code,field_id,home_team_id,away_team_id,home_label,away_label,home_score,away_score,score_sets,winner_side,tie_winner,published,source_sheet,source_row)
 SELECT p_import_id,x.id,e.id,x.day,x.start::time,(x.start::time+make_interval(mins=>coalesce(x."durationMinutes",CASE e.sport WHEN 'football' THEN CASE e.level WHEN 'kg' THEN 25 WHEN 'lower' THEN 35 WHEN 'upper' THEN 41 ELSE 45 END WHEN 'volleyball' THEN 60 WHEN 'takraw' THEN 30 ELSE 90 END)))::time,
 coalesce(x."durationMinutes",CASE e.sport WHEN 'football' THEN CASE e.level WHEN 'kg' THEN 25 WHEN 'lower' THEN 35 WHEN 'upper' THEN 41 ELSE 45 END WHEN 'volleyball' THEN 60 WHEN 'takraw' THEN 30 ELSE 90 END),
 CASE x.stage WHEN 'league' THEN 'round_robin' ELSE x.stage END,
 CASE x.stage WHEN 'group' THEN 'แบ่งกลุ่ม' WHEN 'league' THEN 'พบกันหมด' WHEN 'semi' THEN 'รองชนะเลิศ' WHEN 'third' THEN 'ชิงอันดับ 3' ELSE 'ชิงชนะเลิศ' END,
 nullif(x."group",''),x.field,ht.id,at.id,x.home,x.away,nullif(x."homeScore",'')::integer,nullif(x."awayScore",'')::integer,coalesce(x."scoreSets",'[]'::jsonb),
 CASE WHEN nullif(x."homeScore",'')::integer>nullif(x."awayScore",'')::integer THEN 'home' WHEN nullif(x."homeScore",'')::integer<nullif(x."awayScore",'')::integer THEN 'away' ELSE nullif(x."tieWinner",'') END,
 nullif(x."tieWinner",''),x.published,'admin',1
 FROM jsonb_to_recordset(p_matches) AS x(id text,day integer,start text,"durationMinutes" integer,sport text,level text,type text,field text,home text,away text,stage text,"group" text,"homeScore" text,"awayScore" text,"scoreSets" jsonb,"tieWinner" text,published boolean)
 JOIN public.sports_naklang3_events e ON e.import_id=p_import_id AND e.sport=x.sport AND e.level=x.level AND e.type=x.type
 LEFT JOIN public.sports_naklang3_teams ht ON ht.import_id=p_import_id AND ht.event_id=e.id AND ht.placeholder=x.home
 LEFT JOIN public.sports_naklang3_teams at ON at.import_id=p_import_id AND at.event_id=e.id AND at.placeholder=x.away
 ON CONFLICT(import_id,id) DO UPDATE SET event_id=excluded.event_id,day=excluded.day,start_time=excluded.start_time,end_time=excluded.end_time,duration_minutes=excluded.duration_minutes,stage=excluded.stage,stage_name=excluded.stage_name,group_code=excluded.group_code,field_id=excluded.field_id,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id,home_label=excluded.home_label,away_label=excluded.away_label,home_score=excluded.home_score,away_score=excluded.away_score,score_sets=excluded.score_sets,winner_side=excluded.winner_side,tie_winner=excluded.tie_winner,published=excluded.published;
 UPDATE public.sports_naklang3_teams t SET school_name=x.school_name,logo_url=x.logo_url FROM jsonb_to_recordset(p_teams) AS x(id text,school_name text,logo_url text) WHERE t.import_id=p_import_id AND t.id=x.id;
 UPDATE public.sports_naklang3_runtime SET config=p_config,version=version+1 WHERE import_id=p_import_id;
 RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.sports_naklang3_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sports_naklang3_commit(uuid,bigint,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sports_naklang3_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sports_naklang3_commit(uuid,bigint,jsonb,jsonb,jsonb) TO service_role;
