<?php
include_once 'global.php';

if (isset($_GET['compositionUuid'])) {
    $compositionUuid = mysqli_real_escape_string($conn, $_GET['compositionUuid']);
}

if (!isset($compositionUuid)) {
    error('missing-parameters', 400);
}

// delete the file
$result = mysqli_query($conn, "SELECT id FROM composition_file WHERE composition_uuid = '" . $compositionUuid . "'");
if ($result->num_rows > 0) {
    $row = mysqli_fetch_assoc($result);
    deleteCompositionFile($conn, $compositionFileDirectory, $row['id']);
}

mysqli_close($conn);
