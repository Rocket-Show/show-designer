<?php
include_once 'database.php';

$compositionFileDirectory = 'composition-files';

// Allow from any origin. When credentials are included (withCredentials on the
// client), the spec forbids the '*' wildcard, so the requesting origin must be
// echoed back instead. Vary: Origin keeps caches from serving one origin's
// response to another.
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

// Access-Control headers are received during OPTIONS requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
        // may also be using PUT, PATCH, HEAD etc
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE');

    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
        header('Access-Control-Allow-Headers: Content-Type, Accept, Authorization, Cache-Control, X-Requested-With');

    exit(0);
}

function utf8ize($d)
{
    if (is_array($d)) {
        foreach ($d as $k => $v) {
            $d[$k] = utf8ize($v);
        }
        return $d;
    }

    if (is_string($d)) {
        return mb_convert_encoding($d, 'UTF-8', 'ISO-8859-1');
    }

    return $d;
}

function error($errorMessage = 'internal', $status = 500)
{
    $error = array(
        'error' => $errorMessage
    );
    http_response_code($status);
    echo json_encode(utf8ize($error));
    exit();
}

function errorUnauthorized()
{
    error('unauthorized', 401);
}

// Get the user ID from a provided token
function getUserId($conn)
{
    if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
        return null;
    }
    $token = mysqli_real_escape_string($conn, $_SERVER['HTTP_AUTHORIZATION']);
    $result = mysqli_query($conn, "SELECT user_id FROM session WHERE token = '" . $token . "'");
    if ($result->num_rows > 0) {
        $row = mysqli_fetch_assoc($result);
        return $row['user_id'];
    }
    return null;
}

// Checks, whether a user has a role
function userHasRole($conn, $userId, $roleAlias)
{
    $result = mysqli_query($conn, "SELECT 1 FROM user_role LEFT JOIN role ON role.id = user_role.role_id WHERE user_role.user_id = " . $userId . " AND role.alias = '" . $roleAlias . "'");
    if ($result->num_rows > 0) {
        $row = mysqli_fetch_assoc($result);
        return $row['user_id'];
    }
    return null;
}

// Deletes a composition file and the entry in the databse
function deleteCompositionFile($conn, $compositionFileDirectory, $id)
{
    $result = mysqli_query($conn, "SELECT name FROM composition_file WHERE id = '" . $id . "'");
    if ($result->num_rows > 0) {
        $row = mysqli_fetch_assoc($result);
        $oldFileName = $row['name'];
        if (file_exists($compositionFileDirectory . '/' . $oldFileName)) {
            unlink($compositionFileDirectory . '/' . $oldFileName);
        }
        $result = mysqli_query($conn, "DELETE FROM composition_file WHERE id = '" . $id . "'");
        if (!$result) {
            error();
        }
    }
}
