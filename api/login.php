<?php
include_once 'global.php';

// Up to October 2026 the designer sent the email and the password into the address as they were typed: a "+"
// arrived as a space, a "%" took the two characters after it for a code, and an "&" or a "#" cut off the rest.
// The users who registered back then were stored like that, which they are still found with.
function asSentUnencoded($value)
{
    return urldecode(preg_split('/[&#]/', $value)[0]);
}

// the user with these credentials, or null
function findUser($conn, $email, $password)
{
    $result = mysqli_query($conn, "SELECT id, username, password FROM user WHERE active = 1 AND email = '" . mysqli_real_escape_string($conn, $email) . "'");
    if ($result->num_rows == 0) {
        return null;
    }

    $row = mysqli_fetch_assoc($result);
    return password_verify($password, $row['password']) ? $row : null;
}

$email = $_GET['email'] ?? '';
$password = $_GET['password'] ?? '';

$row = findUser($conn, $email, $password);
if (!$row) {
    $row = findUser($conn, asSentUnencoded($email), asSentUnencoded($password));
}
if (!$row) {
    error('wrong-credentials', 400);
}

$userId = $row['id'];
$username = $row['username'];
$token = bin2hex(openssl_random_pseudo_bytes(26));
$result = mysqli_query($conn, "INSERT INTO session(user_id, token) VALUES('" . $userId . "', '" . $token . "')");
if (!$result) {
    error();
}
$tokenResponse = array(
    'token' => $token,
    'username' => $username
);
echo json_encode(utf8ize($tokenResponse));

mysqli_close($conn);
