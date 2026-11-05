<?php
// Routes the requests of PHP's built-in server the way api/.htaccess has Apache route them: the
// addresses without .php, file/upload and file/delete, and the composition files. Each script
// runs in its own directory, like on Apache.
$path = ltrim(rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');
$routes = array(
    'file/upload' => 'file-upload.php',
    'file/delete' => 'file-delete.php',
    'composition-files' => 'composition-files/index.php',
    'composition-files/' => 'composition-files/index.php',
);

if (isset($routes[$path])) {
    $script = $routes[$path];
} elseif (preg_match('/^[a-z-]+(\.php)?$/', $path) && is_file($_SERVER['DOCUMENT_ROOT'] . '/' . preg_replace('/\.php$/', '', $path) . '.php')) {
    $script = preg_replace('/\.php$/', '', $path) . '.php';
} else {
    http_response_code(404);
    return true;
}

$_SERVER['SCRIPT_NAME'] = '/' . $script;
chdir($_SERVER['DOCUMENT_ROOT'] . '/' . dirname($script));
require basename($script);
