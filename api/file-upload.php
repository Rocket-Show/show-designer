<?php
include_once 'global.php';

$projectId = 'NULL';
if (isset($_GET['projectId']) && strlen($_GET['projectId']) > 0) {
    // the id is not quoted in the query -> only a number may get there
    $projectId = (int) $_GET['projectId'];
}

if (!isset($_GET['compositionUuid'])) {
    error('missing-parameters', 400);
}

// the uuid names the stored file -> it must not lead out of the file directory
if (!isValidCompositionUuid($_GET['compositionUuid'])) {
    error('wrong-parameters', 400);
}

$compositionUuid = mysqli_real_escape_string($conn, $_GET['compositionUuid']);

if (!mayChangeCompositionFile($conn, getUserId($conn), $_GET['compositionUuid'], $projectId === 'NULL' ? null : $projectId)) {
    errorUnauthorized();
}

// delete an existing file, if available
$result = mysqli_query($conn, "SELECT id FROM composition_file WHERE composition_uuid = '" . $compositionUuid . "'");
if ($result->num_rows > 0) {
    $row = mysqli_fetch_assoc($result);
    deleteCompositionFile($conn, $compositionFileDirectory, $row['id']);
}

if (!isset($_FILES['file'])) {
    error('missing-parameters', 400);
}

$file = $_FILES['file'];
$fileTmpName = $_FILES['file']['tmp_name'];
$fileName = mysqli_real_escape_string($conn, $_FILES['file']['name']);
$fileSize = mysqli_real_escape_string($conn, $_FILES['file']['size']);
$fileType = mysqli_real_escape_string($conn, $_FILES['file']['type']);
$fileNameSplitted = explode('.', $fileName);
$fileExtension = strtolower(end($fileNameSplitted));
$fileError = $_FILES['file']['error'];

if (in_array($fileExtension, $compositionFileExtensions)) {
    if ($fileError === 0) {
        if ($fileSize < 100000000) { // 100 MB
            $fileNameNew = $compositionUuid . "." . $fileExtension;
            $fileDestination = $compositionFileDirectory . '/' . $fileNameNew;
            move_uploaded_file($fileTmpName, $fileDestination);
            $result = mysqli_query($conn, "INSERT INTO composition_file(composition_uuid, project_id, name, size_bytes, type) VALUES('" . $compositionUuid . "', " . $projectId . ", '" . $fileNameNew . "', " . $fileSize . ", '" . $fileType . "')");
            if (!$result) {
                error();
            }
        } else {
            error('file-too-large', 400);
        }
    } else {
        error('upload-error', 400);
    }
} else {
    error('format-not-allowed', 400);
}

mysqli_close($conn);
