begin;

drop policy record_read on kxra.records;
create policy record_read on kxra.records for select using(
 case when kind='idea' then kxra_private.can_view_idea(id)
 else kxra_private.is_owner(org_id) or
  (visibility='project_shared' and kxra_private.can_project(project_id)) end
);

commit;
