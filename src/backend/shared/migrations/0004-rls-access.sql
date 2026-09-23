CREATE FUNCTION app_user_id() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::integer $$;

CREATE FUNCTION app_office_ids() RETURNS integer[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT COALESCE(string_to_array(NULLIF(current_setting('app.office_ids', true), ''), ',')::integer[], '{}') $$;

CREATE FUNCTION app_business_ids() RETURNS integer[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT COALESCE(string_to_array(NULLIF(current_setting('app.business_ids', true), ''), ',')::integer[], '{}') $$;

CREATE FUNCTION app_all_offices() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    SELECT app_user_id() IS NOT NULL
        AND COALESCE(NULLIF(current_setting('app.all_offices', true), '')::boolean, false)
$$;

CREATE FUNCTION app_office_visible(p_office_id integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT app_all_offices() OR p_office_id = ANY (app_office_ids()) $$;

CREATE FUNCTION app_business_visible(p_business_id integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT app_all_offices() OR p_business_id = ANY (app_business_ids()) $$;

-- Reads user_offices as the owner, so the users policy does not recurse through user_offices RLS.
CREATE FUNCTION app_shares_office(p_user_id integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_offices WHERE user_id = p_user_id AND office_id = ANY (app_office_ids())
    )
$$;

-- Another user whose offices all lie within the caller's (vacuously true for a user with no
-- offices yet, which is how a new user gets assigned) and who is not an all-offices user.
CREATE FUNCTION app_can_manage_user(p_user_id integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    SELECT app_all_offices() OR (
        app_user_id() IS NOT NULL
        AND p_user_id <> app_user_id()
        AND EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND NOT all_offices)
        AND NOT EXISTS (
            SELECT 1 FROM user_offices WHERE user_id = p_user_id AND office_id <> ALL (app_office_ids())
        )
    )
$$;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
CREATE POLICY businesses_select ON businesses FOR SELECT TO app_user
    USING (app_business_visible(id));
CREATE POLICY businesses_insert ON businesses FOR INSERT TO app_user
    WITH CHECK (app_all_offices());
CREATE POLICY businesses_update ON businesses FOR UPDATE TO app_user
    USING (app_business_visible(id))
    WITH CHECK (app_business_visible(id));
CREATE POLICY businesses_delete ON businesses FOR DELETE TO app_user
    USING (app_business_visible(id));

ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices FORCE ROW LEVEL SECURITY;
CREATE POLICY offices_select ON offices FOR SELECT TO app_user
    USING (app_office_visible(id));
CREATE POLICY offices_insert ON offices FOR INSERT TO app_user
    WITH CHECK (app_all_offices());
CREATE POLICY offices_update ON offices FOR UPDATE TO app_user
    USING (app_office_visible(id))
    WITH CHECK (app_office_visible(id) AND app_business_visible(business_id));

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_select ON users FOR SELECT TO app_user
    USING (id = app_user_id() OR app_all_offices() OR app_shares_office(id));
CREATE POLICY users_insert ON users FOR INSERT TO app_user
    WITH CHECK (app_user_id() IS NOT NULL AND (app_all_offices() OR NOT all_offices));
CREATE POLICY users_update ON users FOR UPDATE TO app_user
    USING (id = app_user_id() OR app_can_manage_user(id))
    WITH CHECK ((app_all_offices() OR NOT all_offices) AND (id = app_user_id() OR app_can_manage_user(id)));

ALTER TABLE user_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_offices FORCE ROW LEVEL SECURITY;
CREATE POLICY user_offices_select ON user_offices FOR SELECT TO app_user
    USING (app_office_visible(office_id));
CREATE POLICY user_offices_insert ON user_offices FOR INSERT TO app_user
    WITH CHECK (app_office_visible(office_id) AND app_can_manage_user(user_id));
CREATE POLICY user_offices_delete ON user_offices FOR DELETE TO app_user
    USING (app_office_visible(office_id) AND app_can_manage_user(user_id));

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY user_permissions_select ON user_permissions FOR SELECT TO app_user
    USING (user_id = app_user_id() OR app_all_offices() OR app_shares_office(user_id));
CREATE POLICY user_permissions_insert ON user_permissions FOR INSERT TO app_user
    WITH CHECK (app_can_manage_user(user_id));
CREATE POLICY user_permissions_delete ON user_permissions FOR DELETE TO app_user
    USING (app_can_manage_user(user_id));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO app_user
    USING (app_office_visible(office_id) OR (office_id IS NULL AND app_business_visible(business_id)));
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO app_user
    WITH CHECK (
        actor_user_id = app_user_id()
        AND (
            app_office_visible(office_id)
            OR (office_id IS NULL AND (business_id IS NULL OR app_business_visible(business_id)))
        )
    );

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON notifications FOR SELECT TO app_user
    USING (user_id = app_user_id());
CREATE POLICY notifications_insert ON notifications FOR INSERT TO app_user
    WITH CHECK (app_user_id() IS NOT NULL);
CREATE POLICY notifications_update ON notifications FOR UPDATE TO app_user
    USING (user_id = app_user_id())
    WITH CHECK (user_id = app_user_id());

CREATE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (id integer, password_hash text, is_active boolean, must_change_password boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    SELECT u.id, u.password_hash, u.is_active, u.must_change_password
    FROM users u
    WHERE u.email = p_email::citext
$$;

CREATE FUNCTION auth_create_session(
    p_user_id integer, p_token_hash text, p_csrf_secret text, p_ip inet, p_user_agent text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE users SET last_login_at = now() WHERE id = p_user_id AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user % does not exist or is inactive', p_user_id USING ERRCODE = 'invalid_authorization_specification';
    END IF;
    INSERT INTO sessions (token_hash, user_id, csrf_secret, ip, user_agent, expires_at, absolute_expires_at)
    VALUES (p_token_hash, p_user_id, p_csrf_secret, p_ip, p_user_agent, now() + interval '12 hours', now() + interval '7 days');
END
$$;

CREATE FUNCTION auth_session(p_token_hash text)
RETURNS TABLE (
    user_id integer, email text, full_name text, role_id integer, role_name text, all_offices boolean,
    must_change_password boolean, permissions text[], office_ids integer[], business_ids integer[], csrf_secret text
)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    WITH touched AS (
        UPDATE sessions s
        SET last_seen_at = now(), expires_at = LEAST(now() + interval '12 hours', s.absolute_expires_at)
        FROM users u
        WHERE s.token_hash = p_token_hash
            AND s.expires_at > now()
            AND s.absolute_expires_at > now()
            AND u.id = s.user_id
            AND u.is_active
        RETURNING s.user_id, s.csrf_secret
    )
    SELECT
        u.id,
        u.email::text,
        u.full_name,
        u.role_id,
        r.name,
        u.all_offices,
        u.must_change_password,
        ARRAY(
            SELECT granted.key FROM (
                SELECT rp.permission_key FROM role_permissions rp WHERE rp.role_id = u.role_id
                UNION
                SELECT up.permission_key FROM user_permissions up WHERE up.user_id = u.id
            ) AS granted (key)
            ORDER BY granted.key COLLATE "C"
        ),
        CASE WHEN u.all_offices
            THEN ARRAY(SELECT o.id FROM offices o ORDER BY o.id)
            ELSE ARRAY(SELECT uo.office_id FROM user_offices uo WHERE uo.user_id = u.id ORDER BY uo.office_id)
        END,
        CASE WHEN u.all_offices
            THEN ARRAY(SELECT b.id FROM businesses b ORDER BY b.id)
            ELSE ARRAY(
                SELECT DISTINCT o.business_id
                FROM user_offices uo JOIN offices o ON o.id = uo.office_id
                WHERE uo.user_id = u.id
                ORDER BY o.business_id
            )
        END,
        t.csrf_secret
    FROM touched t
    JOIN users u ON u.id = t.user_id
    JOIN roles r ON r.id = u.role_id
$$;

CREATE FUNCTION auth_revoke_sessions(p_user_id integer, p_except_token_hash text DEFAULT NULL) RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    WITH deleted AS (
        DELETE FROM sessions
        WHERE user_id = p_user_id AND token_hash IS DISTINCT FROM p_except_token_hash
        RETURNING 1
    )
    SELECT count(*)::integer FROM deleted
$$;

CREATE FUNCTION auth_revoke_session(p_token_hash text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ DELETE FROM sessions WHERE token_hash = p_token_hash $$;

CREATE FUNCTION auth_cleanup_sessions() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    WITH deleted AS (
        DELETE FROM sessions WHERE expires_at <= now() OR absolute_expires_at <= now() RETURNING 1
    )
    SELECT count(*)::integer FROM deleted
$$;

CREATE FUNCTION auth_log_event(p_actor_id integer, p_action text, p_ip inet, p_meta jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_action NOT LIKE 'auth.%' THEN
        RAISE EXCEPTION 'auth_log_event only records auth.* actions, got %', p_action USING ERRCODE = 'invalid_parameter_value';
    END IF;
    INSERT INTO audit_logs (actor_user_id, action, ip, after) VALUES (p_actor_id, p_action, p_ip, p_meta);
END
$$;

REVOKE EXECUTE ON FUNCTION
    app_user_id(), app_office_ids(), app_business_ids(), app_all_offices(),
    app_office_visible(integer), app_business_visible(integer), app_shares_office(integer),
    app_can_manage_user(integer),
    auth_find_user_by_email(text), auth_create_session(integer, text, text, inet, text), auth_session(text),
    auth_revoke_sessions(integer, text), auth_revoke_session(text), auth_cleanup_sessions(),
    auth_log_event(integer, text, inet, jsonb)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    app_user_id(), app_office_ids(), app_business_ids(), app_all_offices(),
    app_office_visible(integer), app_business_visible(integer), app_shares_office(integer),
    app_can_manage_user(integer),
    auth_find_user_by_email(text), auth_create_session(integer, text, text, inet, text), auth_session(text),
    auth_revoke_sessions(integer, text), auth_revoke_session(text), auth_cleanup_sessions(),
    auth_log_event(integer, text, inet, jsonb)
    TO app_user;
