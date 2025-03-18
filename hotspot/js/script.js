// Trial form handling
document.querySelector('.try-button').addEventListener('click', () => {
    const trialForm = document.getElementById('trial-form');
    trialForm.style.display = trialForm.style.display === 'none' ? 'flex' : 'none';
});

// Trial form validation

document.querySelector('.submit-trial-button').addEventListener('click', async (e) => {
    e.preventDefault();
    const name = document.getElementById('trial-name').value.trim();
    const email = document.getElementById('trial-email').value.trim();
    const phone = document.getElementById('trial-phone').value.trim();
    const macAddress = '$(mac-esc)';
    const errorElement = document.getElementById('trial-error');
    const button = e.target;

    if (!name || !email || !phone) {
        errorElement.textContent = 'All fields are required.';
        errorElement.style.display = 'block';
        return;
    }
    if (!/^\d{9,10}$/.test(phone)) {
        errorElement.textContent = 'Enter a valid phone number (e.g., 0751234567).';
        errorElement.style.display = 'block';
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorElement.textContent = 'Enter a valid email address.';
        errorElement.style.display = 'block';
        return;
    }
    errorElement.style.display = 'none';

    button.classList.add('loading');
    document.getElementById('payment-status').style.display = 'block';
    document.getElementById('payment-status').innerHTML = 'Processing your 20-minute trial...';

    try {
        const response = await fetch('https://pixelnet.vercel.app/api/trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, macAddress }),
        });
        const data = await response.json();

        if (response.ok) {
            button.classList.remove('loading');
            document.getElementById('payment-status').innerHTML = 'Trial activated! Redirecting to portfolio...';
            loginToMikrotik(data.username, data.password, 'https://your-portfolio-website.com');
        } else {
            throw new Error(data.error || 'Failed to process trial');
        }
    } catch (error) {
        button.classList.remove('loading');
        document.getElementById('payment-status').innerHTML = error.message || 'Error processing trial. Try again.';
        setTimeout(() => document.getElementById('payment-status').style.display = 'none', 3000);
    }
});





// Login form validation

document.querySelector('.try-button').addEventListener('click', () => {
    const loginForm = document.forms['mikrotik-login'];
    loginForm.username.value = 'guest';
    loginForm.password.value = '';
    loginForm.submit();
});



// Voucher form validation
document.querySelector('.voucher-button').addEventListener('click', (e) => {
    const voucherInput = document.querySelector('.voucher-input');
    const errorElement = document.getElementById('voucher-error');
    const voucherCode = voucherInput.value.trim();

    if (!voucherCode) {
        e.preventDefault();
        errorElement.textContent = 'Please enter a voucher code.';
        errorElement.style.display = 'block';
    } else {
        // Only hide if no MikroTik error is present
        if (!errorElement.textContent.includes('Invalid code')) {
            errorElement.style.display = 'none';
        }
    }
});

// Buy Button Logic 

const buyButtons = document.querySelectorAll('.buy-package-button');
const purchaseForms = document.querySelectorAll('.purchase-form');

buyButtons.forEach(button => {
    button.addEventListener('click', () => {
        const packageId = button.getAttribute('data-package');
        const targetForm = document.getElementById(`form-${packageId}`);
        purchaseForms.forEach(form => {
            if (form !== targetForm) form.style.display = 'none';
        });
        targetForm.style.display = targetForm.style.display === 'none' ? 'flex' : 'none';
    });
});

// Purchase form validation

document.querySelectorAll('.submit-button').forEach(button => {
    button.addEventListener('click', async () => {
        const packageId = button.getAttribute('data-package');
        const phone = document.getElementById(`phone-${packageId}`).value;
        const price = document.querySelector(`.buy-package-button[data-package="${packageId}"]`).getAttribute('data-price');
        const paymentMethod = document.querySelector(`input[name="payment-${packageId}"]:checked`).value;
        const errorElement = document.getElementById(`error-${packageId}`);

        if (!phone) {
            errorElement.textContent = 'Phone number is required.';
            errorElement.style.display = 'block';
            return;
        } else if (!/^\d{9,10}$/.test(phone)) {
            errorElement.textContent = 'Enter a valid phone number (e.g., 0751234567).';
            errorElement.style.display = 'block';
            return;
        } else {
            errorElement.style.display = 'none';
        }

        button.classList.add('loading');
        document.getElementById('payment-status').style.display = 'block';
        document.getElementById('payment-status').innerHTML = 'Awaiting PIN entry on your phone...';

        try {
            const response = await fetch('https://pixelnet.vercel.app/api/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone,
                    amount: price,
                    package: packageId,
                    payment_method: paymentMethod,
                }),
            });

            const data = await response.json();
            if (data.order_tracking_id) {
                checkPaymentStatus(data.order_tracking_id, packageId, data.payment_method, button);
            } else {
                throw new Error('No transaction ID returned');
            }
        } catch (error) {
            button.classList.remove('loading');
            document.getElementById('payment-status').innerHTML = 'Payment initiation failed. Try again.';
            setTimeout(() => document.getElementById('payment-status').style.display = 'none', 3000);
        }
    });
});

// Check payment status

async function checkPaymentStatus(orderTrackingId, packageId, paymentMethod, button) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`https://pixelnet.vercel.app/api/payment?check_status=${orderTrackingId}&package=${packageId}&payment_method=${paymentMethod}`);
            const status = await response.json();

            if (status.status === 'COMPLETED') {
                clearInterval(interval);
                button.classList.remove('loading');
                document.getElementById('payment-status').innerHTML = 'Payment successful! Connecting...';
                loginToMikrotik(status.username, status.password, '/hotspot/success.html');
            } else if (status.status === 'FAILED' || status.status === 'INVALID') {
                clearInterval(interval);
                button.classList.remove('loading');
                document.getElementById('payment-status').innerHTML = 'Payment failed. Please try again.';
                setTimeout(() => document.getElementById('payment-status').style.display = 'none', 3000);
            } else {
                document.getElementById('payment-status').innerHTML = 'Verifying payment...';
            }
        } catch (error) {
            clearInterval(interval);
            button.classList.remove('loading');
            document.getElementById('payment-status').innerHTML = 'Error checking payment. Try again.';
            setTimeout(() => document.getElementById('payment-status').style.display = 'none', 3000);
        }
    }, 5000);
}

// Login to Mikrotik

function loginToMikrotik(username, password, redirectUrl) {
    const loginForm = document.forms['mikrotik-login'];
    loginForm.username.value = username;
    loginForm.password.value = password || '';
    if (redirectUrl) {
        loginForm.dst.value = redirectUrl;
    }
    loginForm.submit();
}