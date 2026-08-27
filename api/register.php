<?php
include_once 'global.php';

$email = mysqli_real_escape_string($conn, $_GET['email']);
$username = mysqli_real_escape_string($conn, $_GET['username']);
// The user opted in to receive news and updates by email
$newsletter = isset($_GET['newsletter']) && filter_var($_GET['newsletter'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;

$result = mysqli_query($conn, "SELECT 1 FROM user WHERE email = '" . $email . "'");
if ($result->num_rows > 0) {
    // This email is already registered
    error('email-exists', 400);
} else {
    // Insert the new user
    $password = password_hash($_GET['password'], PASSWORD_BCRYPT);
    $result = mysqli_query($conn, "INSERT INTO user(username, password, email, newsletter) VALUES('" . $username . "', '" . $password . "', '" . $email . "', " . $newsletter . ")");
    if (!$result) {
        error();
    }
}

mysqli_close($conn);
