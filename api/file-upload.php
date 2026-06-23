<?php
include_once 'global.php';

$projectId = 'NULL';
if (isset($_GET['projectId']) && strlen($_GET['projectId']) > 0) {
    $projectId = mysqli_real_escape_string($conn, $_GET['projectId']);
}

if (isset($_GET['compositionUuid'])) {
    $compositionUuid = mysqli_real_escape_string($conn, $_GET['compositionUuid']);
}

if (!isset($compositionUuid)) {
    error('missing-parameters', 400);
}

// delete an existing file, if available
$result = mysqli_query($conn, "SELECT id FROM composition_file WHERE composition_uuid = '" . $compositionUuid . "'");
if ($result->num_rows > 0) {
    $row = mysqli_fetch_assoc($result);
    deleteCompositionFile($conn, $compositionFileDirectory, $row['id']);
}

$file = $_FILES['file'];
$fileTmpName = $_FILES['file']['tmp_name'];
$fileName = mysqli_real_escape_string($conn, $_FILES['file']['name']);
$fileSize = mysqli_real_escape_string($conn, $_FILES['file']['size']);
$fileType = mysqli_real_escape_string($conn, $_FILES['file']['type']);
$fileNameSplitted = explode('.', $fileName);
$fileExtension = strtolower(end($fileNameSplitted));
$fileError = $_FILES['file']['error'];

$allowed = array('mp3', 'wav', 'ogg');

if (in_array($fileExtension, $allowed)) {
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
            error('file-too-large');
        }
    } else {
        error('upload-error');
    }
} else {
    error('format-not-allowed');
}

mysqli_close($conn);
