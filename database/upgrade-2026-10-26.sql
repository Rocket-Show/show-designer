-- Upgrades an existing database of the online designer (run it once). The new share tokens
-- come from RANDOM_BYTES(), which needs MySQL 5.6.17 or MariaDB 10.10 at least.

-- The projects and the fixture profiles are stored as JSON in their object columns. TEXT
-- holds 64 KB, which a project with pixel fixtures or many presets outgrows. MySQL then
-- refuses to save it ("Data too long for column 'object'", the designer gets a HTTP 500)
-- or, without the strict mode, cuts it off. MEDIUMTEXT holds 16 MB.
ALTER TABLE project MODIFY object MEDIUMTEXT;
ALTER TABLE fixture MODIFY object MEDIUMTEXT;

-- A project saved without a share token (e.g. imported from a file which had none) was
-- stored with an empty one and could be opened by anyone with an empty token. Give each of
-- them a token of its own. The template project (ID 1) is open to everyone anyway.
UPDATE project SET share_token = LOWER(HEX(RANDOM_BYTES(16))) WHERE share_token = '' AND id <> 1;

-- Every project started from the template of the online designer kept the share token of
-- the template, which anyone can read (the template is open to everyone), so each of them
-- could be opened with it. Give all of them a token of their own.
UPDATE project AS p
JOIN (
    SELECT JSON_UNQUOTE(JSON_EXTRACT(object, '$.shareToken')) AS token FROM project WHERE id = 1 AND JSON_VALID(object)
    UNION
    SELECT share_token FROM project WHERE id = 1
) AS template ON p.share_token = template.token
SET p.share_token = LOWER(HEX(RANDOM_BYTES(16)))
WHERE p.id <> 1 AND p.share_token <> '';

-- A project imported from the file of another one kept the token of the other one, which
-- opened it to anyone who had the share link of the other one. Every project but the first
-- of a token gets a token of its own.
UPDATE project AS p
JOIN (
    SELECT share_token, MIN(id) AS first_id FROM project WHERE share_token <> '' GROUP BY share_token HAVING COUNT(*) > 1
) AS shared ON p.share_token = shared.share_token AND p.id <> shared.first_id
SET p.share_token = LOWER(HEX(RANDOM_BYTES(16)));
