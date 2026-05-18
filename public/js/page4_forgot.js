const forgotForm = document.getElementById('forgotForm');
const errorMsg = document.getElementById('errorMsg');
const successMsg = document.getElementById('successMsg');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');
const submitBtn = document.getElementById('submitBtn');

forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();

    btnText.textContent = 'Sending...';
    spinner.style.display = 'inline-block';
    submitBtn.disabled = true;
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (data.success) {
            successMsg.textContent = 'If this email is registered, a recovery code has been sent. Check your inbox.';
            successMsg.style.display = 'block';
            forgotForm.style.display = 'none';

            setTimeout(() => {
                window.location.href = `/reset-password?email=${encodeURIComponent(email)}`;
            }, 2500);
        } else {
            showError(data.error || 'Something went wrong. Please try again.');
        }
    } catch {
        showError('Connection error. Please try again.');
    } finally {
        btnText.textContent = 'Send Recovery Code';
        spinner.style.display = 'none';
        submitBtn.disabled = false;
    }
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}
