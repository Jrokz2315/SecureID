const express = require('express');
const twilio = require('twilio');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const app = express();

// ======================================================================
// CONFIGURATION
// ======================================================================
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const AZURE_APP_URL = process.env.AZURE_APP_URL;
const VERIFIER_AUTHORITY_DID = process.env.VERIFIER_AUTHORITY_DID;
const CREDENTIAL_TYPE = process.env.CREDENTIAL_TYPE || 'VerifiedEmployee';

// ======================================================================
// MIDDLEWARE: HYBRID AUTH
// ======================================================================

// 1. Setup Body Parsers (Increased limit for Verified ID)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 2. Auth Logic (Protects Admin, Allows Twilio)
app.use((req, res, next) => {
    // List of routes that do NOT require login (Robots/Public)
    const openRoutes = [
        '/api/callbacks/twilio', 
        '/api/verifier/callback', 
        '/api/health'
    ];
    
    // Check if path is public or a static asset (like .js, .css, .png)
    const isPublic = 
        openRoutes.some(route => req.path.startsWith(route)) || 
        req.path.includes('.'); 

    if (isPublic) return next();

    // Check for Azure App Service Auth Header
    const principalId = req.headers['x-ms-client-principal-id'];

    if (!principalId) {
        // If it's an API call (like clicking a button), return 401
        if (req.path.startsWith('/api')) {
            return res.status(401).json({ error: 'Unauthorized. Please refresh the page to login.' });
        }
        
        // If it's a Human visiting the site, force the SSO Login Redirect
        return res.redirect('/.auth/login/aad?post_login_redirect_url=/');
    }

    // User is logged in, proceed
    next();
});

// ======================================================================
// STORES
// ======================================================================
const requestStore = new Map();
const verificationStore = new Map();

// ======================================================================
// HELPERS
// ======================================================================
async function getGraphToken(scope = 'https://graph.microsoft.com/.default') {
    try {
        const params = new URLSearchParams();
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('scope', scope);
        params.append('grant_type', 'client_credentials');

        const res = await axios.post(
            `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
            params,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        return res.data.access_token;
    } catch (error) {
        console.error('Token Error:', error.response?.data || error.message);
        throw new Error('Failed to get authentication token');
    }
}

function cleanPhoneNumber(raw) {
    if (!raw) return '';
    let baseNumber = raw.split(/[x#]|ext/i)[0];
    let clean = baseNumber.replace(/[^0-9+]/g, '');
    if (clean.length === 10) return '+1' + clean;
    if (clean.length === 11 && clean.startsWith('1')) return '+' + clean;
    if (!clean.startsWith('+')) return '+' + clean;
    return clean;
}

async function getUserIdByEmail(email) {
    const token = await getGraphToken();
    const headers = { Authorization: `Bearer ${token}` };
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}`;
    const res = await axios.get(url, { headers });
    return res.data.id;
}

function generatePassword(length = 14) {
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nums = "0123456789";
    const special = "@#$!%*?&";
    const all = lower + upper + nums + special;
    let password = [
        lower[crypto.randomInt(0, lower.length)],
        upper[crypto.randomInt(0, upper.length)],
        nums[crypto.randomInt(0, nums.length)],
        special[crypto.randomInt(0, special.length)]
    ];
    while (password.length < length) {
        password.push(all[crypto.randomInt(0, all.length)]);
    }
    return password.sort(() => 0.5 - Math.random()).join('');
}

// ======================================================================
// 1. PHONE FLOW
// ======================================================================
app.get('/api/lookup-user', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const token = await getGraphToken();
        const headers = { Authorization: `Bearer ${token}` };
        const graphRes = await axios.get(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/authentication/phoneMethods`,
            { headers }
        );
        const phones = (graphRes.data.value || []).map(p => ({
            id: p.id,
            type: p.phoneType,
            number: p.phoneNumber,
            masked: p.phoneNumber && p.phoneNumber.length > 4 ? `...${p.phoneNumber.slice(-4)}` : p.phoneNumber
        }));
        if (phones.length === 0) return res.status(404).json({ error: 'No phone numbers found' });
        res.json({ found: true, phones });
    } catch (err) {
        res.status(err.response?.status || 500).json({ error: 'User lookup failed' });
    }
});

app.post('/api/send-sms', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const target = cleanPhoneNumber(phoneNumber);
        const codeStr = String(code);
        verificationStore.set(target, { code: codeStr, createdAt: Date.now() });
        console.log(`[VERIFY] SMS to ${target}: ${codeStr}`);
        await twilioClient.messages.create({
            body: `Your verification code is: ${codeStr}`,
            from: TWILIO_PHONE_NUMBER,
            to: target
        });
        res.json({ success: true, code: codeStr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/call-user', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const target = cleanPhoneNumber(phoneNumber);
        const codeStr = String(code);
        verificationStore.set(target, { code: codeStr, createdAt: Date.now() });
        console.log(`[VERIFY] CALL to ${target}: ${codeStr}`);
        const callbackUrl = `${AZURE_APP_URL}/api/callbacks/twilio?code=${encodeURIComponent(codeStr)}`;
        await twilioClient.calls.create({ url: callbackUrl, to: target, from: TWILIO_PHONE_NUMBER });
        res.json({ success: true, code: codeStr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/callbacks/twilio', (req, res) => {
    try {
        const digits = (req.query.code || '').split('').join(' ');
        const VoiceResponse = twilio.twiml.VoiceResponse;
        const response = new VoiceResponse();
        response.say({ voice: 'alice' }, 'Hello. Your code is.');
        response.pause({ length: 1 });
        response.say({ voice: 'alice' }, digits);
        response.pause({ length: 1 });
        response.say({ voice: 'alice' }, 'Again.');
        response.say({ voice: 'alice' }, digits);
        response.hangup();
        res.type('text/xml');
        res.send(response.toString());
    } catch (err) {
        res.sendStatus(500);
    }
});

app.post('/api/verify-code', (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const target = cleanPhoneNumber(phoneNumber);
        const record = verificationStore.get(target);
        if (!record) return res.status(400).json({ success: false, message: 'No code found' });
        if (Date.now() - record.createdAt > 5 * 60 * 1000) {
            verificationStore.delete(target);
            return res.status(410).json({ success: false, message: 'Code expired' });
        }
        if (String(record.code) !== String(code)) {
            return res.status(401).json({ success: false, message: 'Incorrect code' });
        }
        verificationStore.delete(target);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

// ======================================================================
// 2. VERIFIED ID (DIGITAL ID)
// ======================================================================
app.get('/api/verifier/presentation-request', async (req, res) => {
    try {
        const requestId = crypto.randomUUID();
        const token = await getGraphToken('3db474b9-6a0c-4840-96ac-1fceb342124f/.default');

        const requestConfig = {
            includeQRCode: true,
            callback: {
                url: `${AZURE_APP_URL}/api/verifier/callback`,
                state: requestId,
                headers: { 'api-key': 'secret-verification-key' }
            },
            authority: VERIFIER_AUTHORITY_DID,
            registration: { clientName: 'IT Helpdesk' },
            requestedCredentials: [
                {
                    type: CREDENTIAL_TYPE,
                    acceptedIssuers: [VERIFIER_AUTHORITY_DID]
                }
            ]
        };

        const apiRes = await axios.post(
            'https://verifiedid.did.msidentity.com/v1.0/verifiablecredentials/createPresentationRequest',
            requestConfig,
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        requestStore.set(requestId, { status: 'WAITING', timestamp: Date.now() });
        res.json({ requestId, url: apiRes.data.url, qrCode: apiRes.data.qrCode });
    } catch (err) {
        console.error('Verified ID Request Error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to generate request' });
    }
});

app.post('/api/verifier/callback', (req, res) => {
    try {
        const { state, requestStatus, verifiedCredentialsData } = req.body;
        if (state && requestStore.has(state)) {
            if (requestStatus === 'presentation_verified') {
                const claims = verifiedCredentialsData?.[0]?.claims || {};
                
                // === NAME EXTRACTION FIX ===
                // Check all possible standard claim fields for name
                const firstName = claims.firstName || claims.given_name || claims.givenName || '';
                const lastName = claims.lastName || claims.family_name || claims.familyName || claims.surname || '';
                const displayName = claims.displayName || claims.name || '';
                
                let finalName = displayName;
                if (firstName || lastName) {
                    finalName = `${firstName} ${lastName}`.trim();
                }

                // Fallback if still empty
                if (!finalName) finalName = 'Verified User (No Name Claim)';

                requestStore.set(state, {
                    status: 'VERIFIED',
                    name: finalName,
                    job: claims.jobTitle || claims.job || claims.title || 'Employee',
                    timestamp: Date.now()
                });
            } else if (requestStatus === 'request_retrieved') {
                requestStore.set(state, { status: 'SCANNED', timestamp: Date.now() });
            } else {
                requestStore.set(state, { status: requestStatus, timestamp: Date.now() });
            }
        }
        res.sendStatus(200);
    } catch (err) {
        console.error('Callback Error:', err);
        res.sendStatus(200);
    }
});

app.get('/api/verifier/status', (req, res) => {
    const { requestId } = req.query;
    const data = requestStore.get(requestId);
    res.json(data || { status: 'NOT_FOUND' });
});

// ======================================================================
// 3. ADMIN ACTIONS
// ======================================================================
app.post('/api/admin/reset-password', async (req, res) => {
    try {
        const { email } = req.body;
        const userId = await getUserIdByEmail(email);
        const newPassword = generatePassword(14);
        const token = await getGraphToken();

        await axios.patch(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}`,
            {
                passwordProfile: { forceChangePasswordNextSignIn: true, password: newPassword },
                accountEnabled: true
            },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        res.json({ success: true, password: newPassword });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Password reset failed' });
    }
});

app.post('/api/admin/reset-mfa', async (req, res) => {
    try {
        const { email } = req.body;
        const userId = await getUserIdByEmail(email);
        const token = await getGraphToken();
        const headers = { Authorization: `Bearer ${token}` };

        // 1. REVOKE SESSIONS (This is the critical part for "Re-Register" behavior)
        await axios.post(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/revokeSignInSessions`,
            {},
            { headers }
        );

        // 2. ATTEMPT DELETE METHODS (Ignore failures for defaults)
        const methodsRes = await axios.get(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/authentication/methods`,
            { headers }
        );

        let deleted = 0;
        
        for (const m of (methodsRes.data.value || [])) {
            // Skip Password/Email
            if (m['@odata.type']?.includes('password') || m['@odata.type']?.includes('email')) continue;

            try {
                await axios.delete(
                    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/authentication/methods/${m.id}`,
                    { headers }
                );
                deleted++;
            } catch (e) {
                // We intentionally ignore errors here because we expect
                // defaults to fail deletion via API.
            }
        }

        // Return a cleaner success message
        res.json({ 
            success: true, 
            message: `Sessions successfully revoked. ${deleted} old methods deleted. (Note: Default/System methods are retained by Azure policy but user will be prompted to login).` 
        });

    } catch (err) {
        console.error('MFA Reset Error:', err);
        res.status(500).json({ success: false, error: 'MFA reset failed' });
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`App URL: ${AZURE_APP_URL}`);
});