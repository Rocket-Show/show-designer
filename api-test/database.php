<?php
// The database of the API tests, in place of api/database.php (see README.md)
$conn = new mysqli(
    getenv('DESIGNER_TEST_DB_HOST') ?: '127.0.0.1',
    getenv('DESIGNER_TEST_DB_USER') ?: 'designer',
    getenv('DESIGNER_TEST_DB_PASSWORD') ?: 'designer',
    getenv('DESIGNER_TEST_DB_NAME') ?: 'designer_test',
    (int) (getenv('DESIGNER_TEST_DB_PORT') ?: 3306)
);
