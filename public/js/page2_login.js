const loginForm = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');
const successMsg = document.getElementById('successMsg');

// Show success message if redirected from reset
if (new URLSearchParams(window.location.search).get('reset') === 'success') {
    successMsg.textContent = 'Password reset successfully. You can now log in.';
    successMsg.style.display = 'block';
}
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    btnText.textContent = 'Signing in...';
    spinner.style.display = 'inline-block';
    document.getElementById('loginBtn').disabled = true;
    errorMsg.style.display = 'none';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = '/';
        } else {
            showError(data.error || 'Invalid email or password');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        btnText.textContent = 'Login';
        spinner.style.display = 'none';
        document.getElementById('loginBtn').disabled = false;
    }
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}
