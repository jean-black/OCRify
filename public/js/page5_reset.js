const resetForm = document.getElementById('resetForm');
const errorMsg = document.getElementById('errorMsg');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');
const resetBtn = document.getElementById('resetBtn');

// Pre-fill email from URL param if coming from forgot page
const params = new URLSearchParams(window.location.search);
if (params.get('email')) {
    document.getElementById('email').value = params.get('email');
}

// Allow only digits in the code field
document.getElementById('code').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
});

resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const code = document.getElementById('code').value.trim();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    if (newPassword.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }

    btnText.textContent = 'Resetting...';
    spinner.style.display = 'inline-block';
    resetBtn.disabled = true;
    errorMsg.style.display = 'none';

    try {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code, newPassword })
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = '/login?reset=success';
        } else {
            showError(data.error || 'Reset failed. Please check your code and try again.');
        }
    } catch {
        showError('Connection error. Please try again.');
    } finally {
        btnText.textContent = 'Reset Password';
        spinner.style.display = 'none';
        resetBtn.disabled = false;
    }
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}
