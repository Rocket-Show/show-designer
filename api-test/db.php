<?php
// The database of the API tests, for the tests themselves:
//   php db.php reset          creates it anew from database/model.sql
//   php db.php query "<sql>"  runs the statements and prints the rows of the last one as JSON
$name = getenv('DESIGNER_TEST_DB_NAME') ?: 'designer_test';
$conn = new mysqli(
    getenv('DESIGNER_TEST_DB_HOST') ?: '127.0.0.1',
    getenv('DESIGNER_TEST_DB_USER') ?: 'designer',
    getenv('DESIGNER_TEST_DB_PASSWORD') ?: 'designer',
    null,
    (int) (getenv('DESIGNER_TEST_DB_PORT') ?: 3306)
);

function run($conn, $statements)
{
    $rows = array();
    $conn->multi_query($statements);

    do {
        $result = $conn->store_result();
        $rows = $result ? $result->fetch_all(MYSQLI_ASSOC) : array();
    } while ($conn->more_results() && $conn->next_result());

    return $rows;
}

if ($argv[1] === 'reset') {
    $conn->query('DROP DATABASE IF EXISTS `' . $name . '`');
    $conn->query('CREATE DATABASE `' . $name . '` CHARACTER SET utf8mb4');
    $conn->select_db($name);
    run($conn, file_get_contents(__DIR__ . '/../database/model.sql'));
} else {
    $conn->select_db($name);
    echo json_encode(run($conn, $argv[2]));
}
