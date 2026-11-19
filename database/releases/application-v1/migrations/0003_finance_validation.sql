begin;
alter table kxra.records add constraint financial_data_valid check(kind<>'finance' or (
 data ?& array['amount','currency','entry_type','direction'] and
 jsonb_typeof(data->'amount')='string' and data->>'amount' ~ '^\d{1,12}(\.\d{1,4})?$' and
 data->>'currency' in ('GBP','USD','EUR') and
 data->>'entry_type' in ('actual','commitment','estimate','paper') and
 data->>'direction' in ('income','expense')
));
commit;
