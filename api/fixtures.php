<?php
include_once 'global.php';

$where = "";

if (isset($_GET["uuid"])) {
    $where .= ' AND fixture.uuid = "' . mysqli_real_escape_string($conn, $_GET["uuid"]) . '"';
}

if (isset($_GET["manufacturerShortName"])) {
    $where .= ' AND fixture.manufacturer_short_name like "' . mysqli_real_escape_string($conn, $_GET["manufacturerShortName"]) . '"';
}

if (isset($_GET["name"])) {
    $where .= ' AND fixture.name like "' . mysqli_real_escape_string($conn, $_GET["name"]) . '"';
}

if (isset($_GET["mainCategory"])) {
    $where .= ' AND main_category = "' . mysqli_real_escape_string($conn, $_GET["mainCategory"]) . '"';
}

$result = mysqli_query($conn, "SELECT fixture.uuid, fixture.name fixture_name, fixture.main_category, manufacturer.short_name manufacturer_short_name, manufacturer.name manufacturer_name FROM fixture LEFT JOIN manufacturer ON manufacturer.short_name = fixture.manufacturer_short_name WHERE 1 = 1" . $where . " ORDER BY manufacturer.name, fixture.name");

if(!$result) {
    error();
}

$fixtures = array();

while ($row = mysqli_fetch_assoc($result)) {
    $fixture = array(
        "uuid" => $row["uuid"],
        "manufacturerName" => $row["manufacturer_name"],
        "manufacturerShortName" => $row["manufacturer_short_name"],
        "name" => $row["fixture_name"],
        "mainCategory" => $row["main_category"]
    );

    array_push($fixtures, $fixture);
}

echo json_encode(utf8ize($fixtures));

mysqli_close($conn);