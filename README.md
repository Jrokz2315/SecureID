<h1 align="center">🔐 SecureID</h1>
A lightweight web application for IT Helpdesks to verify user identities remotely and perform administrative actions securely.</p>

🧾 **Azure Identity Manager** (Digital ID & MFA Reset Tool)

A lightweight web application for IT Helpdesks to verify user identities remotely and perform administrative actions (Password Resets, MFA clearing) securely.
<br><br>
✨ **Features:**

📱 Phone Verification

Verify users by sending SMS or calling their file-on-record phone number (via Twilio).

🪪 Digital ID Verification

Verify users by scanning a QR code using their Microsoft Authenticator app (via Entra Verified ID).
You can add FaceCheck if that is a preferred route with Digital ID ($0.25 per scan).
<br><br>
🛠️ **Admin Actions:**

Verify user Identity: Pulls existing MFA registered methods and calls or texts the number on file to ensure identity.

Reset Password: Generates a complex 14-character password.

Revoke & Reset MFA: Revokes user sessions and attempts to clear registered MFA methods to force a re-registration.
<br><br>
📋 **Prerequisites:**

Azure Subscription with an Active Directory (Entra ID) tenant.
https://portal.azure.com/

Twilio Account (Account SID, Auth Token, and a Phone Number).
https://www.twilio.com/en-us

Microsoft Entra Verified ID service enabled (optional, but required for the Digital ID flow).
https://entra.microsoft.com/


⚙️ **Process:**

**Step 1:** Create an Enterprise App

Create and Enterprise App with a name to your liking. Once created I like to go to Properties, set "Assignment Required = Yes and Visible to Users = No. Next under Users and Groups, create a new security group for the users you want to be able to access the app.

Next, Go to Azure App Registration.

A. Look for the APP you previously created, Name: SecureID (Or whatever you set it to)

B. Certificates & secrets: Create a new Client Secret. Copy the Value immediately (you will need it later).

C. API Permissions: Add the following Microsoft Graph permissions (Application type):
1. User.Read (Read user profiles/phones)
2. User.ReadWrite.All (Reset passwords)
3. UserAuthenticationMethod.Read.All
4. UserAuthenticationMethod.ReadWrite.All (Reset MFA)
5. VerifiedId-Profile.Read.All
   
Now under APIs my organization uses: (This is for the Digital ID portion)

6. VerifiableCredential.Create.All
7. VerifiableCredential.Create.IssueRequest
8. VerifiableCredential.Create.PresentRequest

Important: Click "Grant admin consent for <Organization>" after adding them.
<br><br>
**Step 2:** Deployment to Azure App Service

A. Create a new Web App, create a new resource group for easy management, Name the app and select appropriate region. For Runtime Stack choose Node 22+. For the Plan I reccomend a Basic B1 sku at a minimum.

B. Once the app is created, Go to Configuration > Environment variables and add the following Settings and Values:

TENANT_ID	- Your Entra ID Tenant ID

CLIENT_ID	- Application (client) ID

CLIENT_SECRET	- The Secret Value

AZURE_APP_URL	- https://<your-app-name>.azurewebsites.net

TWILIO_ACCOUNT_SID	- From Twilio Console

TWILIO_AUTH_TOKEN	- From Twilio Console

TWILIO_PHONE_NUMBER	- Your Twilio Phone Number

VERIFIER_AUTHORITY_DID - (Optional) Your DID

WEBSITE_AUTH_AAD_ALLOWED_TENANTS	- Tenant IDs (comma separated)

MICROSOFT_PROVIDER_AUTHENTICATION_SECRET - Auto-created
<br><br>
**Step 3:** Secure with SSO (Authentication) This app must be protected so only IT Admins can access it.

A. In your App Service, go to Settings > Authentication. Click Add identity provider → Microsoft. Select the App Registration you created in Step 1.

B. Restrict access: Set to "Allow unauthenticated access". Why? The app handles authentication internally (server.js) to allow Twilio callbacks (robots) to bypass login while forcing humans (Admins) to sign in.
<br><br>
**Step 4:** Redirect URI Configuration

Copy the Web App "Default Domain" – https://<your-app-name>.azurewebsites.net/

Go back to your Registered App and under redirect URI paste: https://<your-app-name>.azurewebsites.net/.auth/login/aad/callback. Under settings in the Redirect URI config, ensure ID tokens is checked.
<br><br>
**Step 5:** Configure Verified ID (Optional)

If using the "Digital ID" tab: Ensure you have a Verifiable Credential (like "VerifiedEmployee") published. In Verified ID settings, ensure your App Service URL is added as a trusted domain. In simpler terms create a "Credential" in Entra under Verified ID.
<br><br>
**Step 6:** Start Your Web App

A. Once started, launch Kudu under Development Tools – Advanced Tools.

B. For simplicity once Kudu launches add /newui to the URL: https://<your-app-name>.scm.canadacentral-01.azurewebsites.net/newui

C. On your computer, create a folder called public. Move the index.html inside this folder.

D. Compress server.js, package.json, and public into individual ZIP files.

E. In Kudu → File Manager → site/wwwroot, upload all ZIPs. Ensure index.html is inside /wwwroot/public.
<br><br>
**Step 7:** Dependencies Installatiom

A. Launch SSH from Kudu.

B. Change directory:

cd site/wwwroot

C. Install dependencies:

npm install

Once complete, restart the Web App.
After ~5 minutes, visit your Default Domain to test SSO login.
<br><br>
🛠️ **Troubleshooting:**

1. “Payload Too Large” on Verified ID. Ensure your server middleware is set to accept large JSON bodies (included in this repo).

2. MFA Reset says “Failed” Graph cannot delete built-in or system MFA methods. The tool performs Revoke Sessions, forcing the user to re-register at next login.
