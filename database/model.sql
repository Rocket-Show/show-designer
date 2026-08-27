-- Create the show designer database model

DROP TABLE IF EXISTS fixture;
DROP TABLE IF EXISTS manufacturer;
DROP TABLE IF EXISTS project_user_role;
DROP TABLE IF EXISTS project_role;
DROP TABLE IF EXISTS project;
DROP TABLE IF EXISTS composition_file;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS user_role;
DROP TABLE IF EXISTS role;

CREATE TABLE manufacturer (
    short_name VARCHAR(200) NOT NULL,
    name VARCHAR(200),
    website VARCHAR(1000),

    PRIMARY KEY(short_name)
);

CREATE TABLE fixture (
    uuid VARCHAR(200) NOT NULL,
    name VARCHAR(200) NOT NULL,
    manufacturer_short_name VARCHAR(200) NOT NULL,
    main_category VARCHAR(200) NOT NULL,
    object TEXT,

    PRIMARY KEY(uuid),
    FOREIGN KEY(manufacturer_short_name) REFERENCES manufacturer(short_name)
);

CREATE TABLE user (
    id INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    active BOOLEAN NOT NULL DEFAULT 1,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL, 
    newsletter BOOLEAN NOT NULL DEFAULT 0,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY(id),
    INDEX (email) 
);

CREATE TABLE session (
    id INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INTEGER UNSIGNED NOT NULL,
    token VARCHAR(255) NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY(id),
    FOREIGN KEY(user_id) REFERENCES user(id),
    INDEX (token) 
);

CREATE TABLE role (
    id INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    alias VARCHAR(255) NOT NULL,

    PRIMARY KEY(id),
    INDEX (alias) 
);
INSERT INTO role(alias) VALUES('admin');

CREATE TABLE user_role (
    id INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INTEGER UNSIGNED NOT NULL,
    role_id INTEGER UNSIGNED NOT NULL,

    PRIMARY KEY(id),
    FOREIGN KEY(user_id) REFERENCES user(id),
    FOREIGN KEY(role_id) REFERENCES role(id)
);

CREATE TABLE project (
    id INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    active BOOLEAN NOT NULL DEFAULT 1,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(255) NOT NULL,
    share_token VARCHAR(255) NOT NULL,
    object TEXT,

    PRIMARY KEY(id)
);
-- Insert the default project template
INSERT INTO project(name) VALUES('New Project');

CREATE TABLE project_role (
    id INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    alias VARCHAR(255) NOT NULL,

    PRIMARY KEY(id),
    INDEX (alias) 
);
INSERT INTO project_role(alias) VALUES('manager');
INSERT INTO project_role(alias) VALUES('read_only');

CREATE TABLE project_user_role (
    id INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id INTEGER UNSIGNED NOT NULL,
    user_id INTEGER UNSIGNED NOT NULL,
    role_id INTEGER UNSIGNED NOT NULL,

    PRIMARY KEY(id),
    FOREIGN KEY(project_id) REFERENCES project(id),
    FOREIGN KEY(user_id) REFERENCES user(id),
    FOREIGN KEY(role_id) REFERENCES project_role(id)
);

CREATE TABLE composition_file (
    id INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    composition_uuid VARCHAR(255) NOT NULL,
    project_id INTEGER UNSIGNED NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    type VARCHAR(100) NOT NULL,

    PRIMARY KEY(id),
    FOREIGN KEY(project_id) REFERENCES project(id),
    INDEX (composition_uuid),
    INDEX (created)
);