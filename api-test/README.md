# Tests of the API

The tests in `api.test.mjs` run the API of the online designer (`api/`) the way the designer uses it: over HTTP, served
by PHP's built-in server, on a MySQL or MariaDB database of their own. Each test starts on an empty database built from
`database/model.sql`. They need PHP (with mysqli), Node.js 22 and a database server (MariaDB 10.10 or MySQL 5.6.17 at
least, for `database/upgrade-2026-10-26.sql`).

```shell
# once: a database and a user for the tests (the database is created anew by each test)
sudo mysql -e "CREATE USER 'designer'@'localhost' IDENTIFIED BY 'designer'; GRANT ALL ON designer_test.* TO 'designer'@'localhost';"

node --test 'api-test/*.test.mjs'
```

The database is reached with `DESIGNER_TEST_DB_HOST` (`127.0.0.1`), `DESIGNER_TEST_DB_PORT` (`3306`),
`DESIGNER_TEST_DB_USER` (`designer`), `DESIGNER_TEST_DB_PASSWORD` (`designer`) and `DESIGNER_TEST_DB_NAME`
(`designer_test`). Its contents are dropped by the tests: never point them to the database of the designer.

- `router.php` routes the requests like `api/.htaccess` does on Apache.
- `database.php` takes the place of `api/database.php` in the copy of the API the tests serve.
- `db.php` builds the database anew and lets the tests look into it.

A warning or a notice of PHP while answering counts as a failure as well (see `phpErrors()`).
