<?php
// a failing query throws (from PHP 8.1 on), which ended the request with an empty HTTP 500
// -> answer with the error of the API all the same and log the cause
set_exception_handler(function ($exception) {
    error('internal', 500, (string) $exception);
});

include_once 'database.php';

$compositionFileDirectory = 'composition-files';

// the audio formats a composition file may have
$compositionFileExtensions = array('mp3', 'wav', 'ogg');

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

function error($errorMessage = 'internal', $status = 500, $cause = null)
{
    global $conn;

    // the client only learns that something went wrong -> keep what it was in the server
    // log: the exception, or the database refusing a query
    if ($cause === null && $status >= 500 && $conn instanceof mysqli && mysqli_errno($conn)) {
        $cause = mysqli_error($conn);
    }
    if ($cause !== null) {
        error_log('designer api ' . basename($_SERVER['SCRIPT_NAME']) . ': ' . $cause);
    }

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
    return $result->num_rows > 0;
}

// Checks, whether a user has a role for a specific project
function userHasProjectRole($conn, $userId, $projectId, $roleAlias)
{
    $result = mysqli_query($conn, "SELECT 1 FROM project_user_role LEFT JOIN project_role ON project_role.id = project_user_role.role_id WHERE project_user_role.user_id = " . $userId . " AND project_user_role.project_id = " . $projectId . " AND project_role.alias = '" . $roleAlias . "'");
    if ($result->num_rows > 0) {
        return true;
    }
    return false;
}

// May the user (null, if nobody is logged in) store or delete the audio file of the passed composition,
// to be connected with the passed project (null for a project which has not been saved yet)? The file of a
// composition of a saved project belongs to the managers of that project. The one of a project which has
// not been saved yet belongs to nobody: the designer uploads it before there is a project, or a user.
function mayChangeCompositionFile($conn, $userId, $compositionUuid, $projectId)
{
    $result = mysqli_query($conn, "SELECT DISTINCT project_id FROM composition_file WHERE project_id IS NOT NULL AND composition_uuid = '" . mysqli_real_escape_string($conn, $compositionUuid) . "'");
    $projectIds = array_column(mysqli_fetch_all($result, MYSQLI_ASSOC), 'project_id');

    if (!is_null($projectId)) {
        $projectIds[] = $projectId;
    }

    foreach ($projectIds as $ownerProjectId) {
        if (
            is_null($userId)
            || !(userHasProjectRole($conn, $userId, (int) $ownerProjectId, 'manager') || userHasRole($conn, $userId, 'admin'))
        ) {
            return false;
        }
    }

    return true;
}

// Whether the passed composition uuid can name a file: the designer builds them from
// letters, digits and dashes only, so anything else (like a path) is refused
function isValidCompositionUuid($uuid)
{
    return is_string($uuid) && preg_match('/^[A-Za-z0-9-]{1,64}$/', $uuid) === 1;
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
