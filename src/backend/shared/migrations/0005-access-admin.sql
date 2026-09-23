ALTER TABLE users ADD COLUMN password_expires_at timestamptz;

DROP FUNCTION auth_find_user_by_email(text);

CREATE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (
    id integer, password_hash text, is_active boolean, must_change_password boolean, password_expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    SELECT u.id, u.password_hash, u.is_active, u.must_change_password, u.password_expires_at
    FROM users u
    WHERE u.email = p_email::citext
$$;

REVOKE EXECUTE ON FUNCTION auth_find_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO app_user;

-- Counts every active user in a role, including users outside the caller's offices, for "Affects N users".
CREATE FUNCTION app_role_user_count(p_role_id integer) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT count(*)::integer FROM users WHERE role_id = p_role_id AND is_active $$;

REVOKE EXECUTE ON FUNCTION app_role_user_count(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_role_user_count(integer) TO app_user;
