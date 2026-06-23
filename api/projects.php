<?php
include_once 'global.php';

$userId = getUserId($conn, $conn);

if (!isset($userId)) {
    errorUnauthorized();
}

$result = mysqli_query($conn, "SELECT project.id, project.name, project_role.alias role_alias FROM project LEFT JOIN project_user_role ON project.id = project_user_role.project_id LEFT JOIN project_role ON project_role.id = project_user_role.role_id WHERE active = 1 AND project_user_role.user_id = " . $userId);

if (!$result) {
    error();
}

$projects = array();

while ($row = mysqli_fetch_assoc($result)) {
    $project = array(
        "id" => $row["id"],
        "name" => $row["name"],
        "roleAlias" => $row["role_alias"]
    );

    array_push($projects, $project);
}

echo json_encode(utf8ize($projects));

mysqli_close($conn);
