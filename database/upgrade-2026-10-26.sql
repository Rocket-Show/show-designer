-- Upgrades an existing database of the online designer (run it once).

-- The projects and the fixture profiles are stored as JSON in their object columns. TEXT
-- holds 64 KB, which a project with pixel fixtures or many presets outgrows. MySQL then
-- refuses to save it ("Data too long for column 'object'", the designer gets a HTTP 500)
-- or, without the strict mode, cuts it off. MEDIUMTEXT holds 16 MB.
ALTER TABLE project MODIFY object MEDIUMTEXT;
ALTER TABLE fixture MODIFY object MEDIUMTEXT;

-- A project saved without a share token (e.g. imported from a file which had none) was
-- stored with an empty one and could be opened by anyone with an empty token. Give each of
-- them a token of its own. The template project (ID 1) is open to everyone anyway.
UPDATE project SET share_token = REPLACE(UUID(), '-', '') WHERE share_token = '' AND id <> 1;
