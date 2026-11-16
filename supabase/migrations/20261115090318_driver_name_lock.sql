create or replace function apex_private.lock_profile_driver_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.driver_name is distinct from old.driver_name then
    raise exception using errcode = 'P0001', message = 'profile_locked';
  end if;
  return new;
end;
$$;

create trigger profiles_driver_name_locked before update of driver_name on apex_private.profiles
  for each row execute function apex_private.lock_profile_driver_name();

create or replace function public.apex_profile_set(p_user_id uuid, p_driver_name text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_existing text;
begin
  if p_user_id is null or p_driver_name is null or p_driver_name !~ '^[A-Za-z0-9_-]{3,20}$' then
    raise exception using errcode = 'P0001', message = 'invalid_driver_name';
  end if;
  select driver_name into v_existing from apex_private.profiles where user_id = p_user_id for update;
  if found then
    if v_existing is distinct from p_driver_name then
      raise exception using errcode = 'P0001', message = 'profile_locked';
    end if;
    return jsonb_build_object('driverName', v_existing);
  end if;
  insert into apex_private.profiles (user_id, driver_name) values (p_user_id, p_driver_name);
  return jsonb_build_object('driverName', p_driver_name);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'name_taken';
end;
$$;

