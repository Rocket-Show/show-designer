<?php
include_once '../global.php';

// Get the file over PHP instead directly, to control the access (TODO) and to set the
// necessary CORS headers, when used from a different domain.
$fileName = isset($_GET['file']) && is_string($_GET['file']) ? $_GET['file'] : '';

// only the composition files stored here are handed out, named after their composition
// (see file-upload.php). Anything else, like a path to another file on the server, is
// refused before it reaches the file system.
$fileNameParts = explode('.', $fileName);
if (
    count($fileNameParts) != 2
    || !isValidCompositionUuid($fileNameParts[0])
    || !in_array(strtolower($fileNameParts[1]), $compositionFileExtensions)
) {
    error('no-file', 404);
}

$fileLocation = $fileName;

if (!file_exists($fileLocation)) {
    error('no-file', 404);
}

header($_SERVER['SERVER_PROTOCOL'] . ' 200 OK');
header('Cache-Control: public');
header('Content-Type: application/zip');
header('Content-Transfer-Encoding: Binary');
header('Content-Length:' . filesize($fileLocation));
header('Content-Disposition: attachment; filename=' . $fileLocation);
readfile($fileLocation);
