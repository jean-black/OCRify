const signupForm = document.getElementById('signupForm');
const errorMsg = document.getElementById('errorMsg');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }

    btnText.textContent = 'Creating account...';
    spinner.style.display = 'inline-block';
    document.getElementById('signupBtn').disabled = true;
    errorMsg.style.display = 'none';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = '/';
        } else {
            showError(data.error || 'Registration failed. Please try again.');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
    } finally {
        btnText.textContent = 'Sign Up';
        spinner.style.display = 'none';
        document.getElementById('signupBtn').disabled = false;
    }
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}
