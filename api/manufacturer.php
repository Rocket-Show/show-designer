<?php
include_once 'global.php';

$manufacturers = array();

$result = mysqli_query($conn, "SELECT * FROM manufacturer");

if(!$result) {
    error();
}

while ($row = mysqli_fetch_assoc($result)) {
    $manufacturer = array(
        "shortName" => $row["short_name"],
        "name" => $row["name"],
        "website" => $row["website"]
    );

    array_push($manufacturers, $manufacturer);
}

echo json_encode(utf8ize($manufacturers));

mysqli_close($conn);
