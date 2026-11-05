<?php
include_once 'global.php';

$fixture = '';

$where = "";

if (isset($_GET["uuid"])) {
    $where .= ' AND uuid = "' . mysqli_real_escape_string($conn, $_GET["uuid"]) . '"';
}

$result = mysqli_query($conn, "SELECT object FROM fixture WHERE 1 = 1" . $where);

if (!$result) {
    error();
}

// nothing (null) for a fixture which is not in the library
$row = mysqli_fetch_assoc($result);
echo $row ? $row["object"] : 'null';

mysqli_close($conn);
