<?php
include_once 'global.php';

// Checks, whether a user has a role for a specific project
function userHasProjectRole($conn, $userId, $projectId, $roleAlias)
{
    $result = mysqli_query($conn, "SELECT 1 FROM project_user_role LEFT JOIN project_role ON project_role.id = project_user_role.role_id WHERE project_user_role.user_id = " . $userId . " AND project_user_role.project_id = " . $projectId . " AND project_role.alias = '" . $roleAlias . "'");
    if ($result->num_rows > 0) {
        return true;
    }
    return false;
}

// Checks, whether a project share token is valid
function projectShareTokenIsValid($conn, $projectId, $shareToken)
{
    // a project without a token of its own is not shared
    if (strlen($shareToken) == 0) {
        return false;
    }

    $result = mysqli_query($conn, "SELECT 1 FROM project WHERE id = " . $projectId . " AND share_token = '" . $shareToken . "'");
    if ($result->num_rows > 0) {
        return true;
    }
    return false;
}

// Checks, whether a project already exists or not
function projectExists($conn, $projectId)
{
    if (!isset($projectId) || strlen($projectId) == 0) {
        return false;
    }
    $result = mysqli_query($conn, "SELECT 1 FROM project WHERE id = " . $projectId);
    if ($result->num_rows > 0) {
        return true;
    }
    return false;
}

$userId = getUserId($conn);
$projectId = '';
if (isset($_GET['id'])) {
    // the id is not quoted in the queries -> only a number may get there
    $projectId = (int) $_GET['id'];
}

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        // Get a project
        if ($projectId === '') {
            error('missing-parameters', 400);
        }

        $authorized = false;

        if ($projectId == 1) {
            $authorized = true;
        }

        if (!$authorized && !is_null($userId)) {
            if (
                userHasProjectRole($conn, $userId, $projectId, 'manager')
                || userHasProjectRole($conn, $userId, $projectId, 'read_only')
                || userHasRole($conn, $userId, 'admin')
            ) {
                $authorized = true;
            }
        }
        if (!$authorized && isset($_GET['token'])) {
            // Maybe the project is shared over a link
            $shareToken = mysqli_real_escape_string($conn, $_GET['token']);

            if (projectShareTokenIsValid($conn, $projectId, $shareToken)) {
                $authorized = true;
            }
        }

        if (!$authorized) {
            errorUnauthorized();
        }

        $result = mysqli_query($conn, "SELECT object, share_token FROM project WHERE active = 1 AND id = " . $projectId);
        if (!$result) {
            error();
        }
        if ($result->num_rows == 0) {
            error('wrong-id', 400);
        }

        $row = mysqli_fetch_assoc($result);

        // the share token saved within the project may be missing or another one than the
        // server holds for it (see the POST) -> hand out the project with the right one, so
        // its share link works without saving it first
        $storedProject = json_decode($row['object'] ?? '');
        if (is_object($storedProject) && strlen($row['share_token']) > 0) {
            $storedProject->{'shareToken'} = $row['share_token'];
            echo json_encode($storedProject, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        } else {
            echo $row['object'];
        }

        break;
    case 'POST':
        // Cleanup: Delete all composition files without project_id, older than 30 days.
        // Such files may be created, if the user creates a new project with some compositions, but
        // never saves the project.
        $removeOlderDays = 30;
        $result = mysqli_query($conn, "SELECT id FROM composition_file WHERE created < CURRENT_DATE() - INTERVAL " . $removeOlderDays . " DAY AND project_id IS NULL");
        while ($row = $result->fetch_assoc()) {
            deleteCompositionFile($conn, $compositionFileDirectory, $row['id']);
        }

        // Save a project
        if (is_null($userId)) {
            errorUnauthorized();
        }

        $newProject = true;
        $authorized = false;

        $projectString = file_get_contents('php://input');
        $projectObject = json_decode($projectString);
        if (!is_object($projectObject)) {
            error('wrong-parameters', 400);
        }
        // a project without compositions (e.g. one written by hand) has no files to keep
        $compositions = isset($projectObject->{'compositions'}) && is_array($projectObject->{'compositions'}) ? $projectObject->{'compositions'} : array();
        $name = mysqli_real_escape_string($conn, $projectObject->{'name'} ?? '');
        // the server hands out the share tokens, the one the designer sends is not taken over:
        // it is the token of the template every new project starts from (which anyone can
        // read), the one of the project a file was exported from, or none at all (an empty
        // token opened the project to anyone). A new project, or one stored without a token,
        // gets this one. The response hands it back to the designer.
        $shareToken = bin2hex(random_bytes(16));

        if (isset($projectObject->{'id'})) {
            $projectId = (int) $projectObject->{'id'};
        }

        if (isset($projectId) && strlen($projectId) > 0 && projectExists($conn, $projectId)) {
            $newProject = false;

            if (
                userHasProjectRole($conn, $userId, $projectId, 'manager')
                || userHasRole($conn, $userId, 'admin')
            ) {
                $authorized = true;
            }
        } else {
            $authorized = true;
        }

        if (!$authorized) {
            errorUnauthorized();
        }

        // store/update the project
        if ($newProject) {
            $result = mysqli_query($conn, "INSERT INTO project(object, name, share_token) VALUES('" . mysqli_real_escape_string($conn, $projectString) . "', '" . $name . "', '" . $shareToken . "')");
            if (!$result) {
                error();
            }
            $projectId = mysqli_insert_id($conn);
            $result = mysqli_query($conn, "INSERT INTO project_user_role(project_id, user_id, role_id) VALUES(" . $projectId . ", " . $userId . ", (SELECT id FROM project_role WHERE alias = 'manager'))");
            if (!$result) {
                error();
            }
        } else {
            $result = mysqli_query($conn, "UPDATE project SET object = '" . mysqli_real_escape_string($conn, $projectString) . "', name = '" . $name . "' WHERE id = " . $projectId);
            if (!$result) {
                error();
            }

            // a project stored without a share token before gets one now
            $result = mysqli_query($conn, "UPDATE project SET share_token = '" . $shareToken . "' WHERE id = " . $projectId . " AND share_token = ''");
            if (!$result) {
                error();
            }
        }

        // delete unused composition files from this project
        $result = mysqli_query($conn, "SELECT id, composition_uuid FROM composition_file WHERE project_id = " . $projectId);
        while ($row = $result->fetch_assoc()) {
            $fileFound = false;

            foreach ($compositions as $composition) {
                if ($composition->{'uuid'} == $row['composition_uuid']) {
                    $fileFound = true;
                    break;
                }
            }

            if (!$fileFound) {
                deleteCompositionFile($conn, $compositionFileDirectory, $row['id']);
            }
        }

        // connect all required files to the project, which are not already connected
        foreach ($compositions as $composition) {
            $result = mysqli_query($conn, "UPDATE composition_file SET project_id = " . $projectId . " WHERE project_id IS NULL and composition_uuid = '" . mysqli_real_escape_string($conn, $composition->{'uuid'}) . "'");
            if (!$result) {
                error();
            }
        }

        // hand the share token back, the designer takes it over for its share links
        $result = mysqli_query($conn, "SELECT share_token FROM project WHERE id = " . $projectId);
        if (!$result) {
            error();
        }
        $row = mysqli_fetch_assoc($result);

        $project = array(
            "id" => $projectId,
            "shareToken" => $row['share_token']
        );
        echo json_encode(utf8ize($project));

        break;
    case 'DELETE':
        // Delete a project
        if (is_null($userId)) {
            errorUnauthorized();
        }

        if ($projectId === '') {
            error('missing-parameters', 400);
        }

        if (
            !userHasProjectRole($conn, $userId, $projectId, 'manager')
            && !userHasRole($conn, $userId, 'admin')
        ) {
            errorUnauthorized();
        }

        $result = mysqli_query($conn, "UPDATE project SET active = 0 WHERE id = " . $projectId);
        if (!$result) {
            error();
        }

        break;
}

mysqli_close($conn);
