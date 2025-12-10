# SecureID
A lightweight web application for IT Helpdesks to verify user identities remotely and perform administrative actions (Password Resets, MFA clearing) securely.

Azure Identity Manager (Digital ID & MFA Reset Tool)
A lightweight web application for IT Helpdesks to verify user identities remotely and perform administrative actions (Password Resets, MFA clearing) securely.

Features:
Phone Verification: Verify users by sending SMS or calling their file-on-record phone number (via Twilio).
Digital ID Verification: Verify users by scanning a QR code using their Microsoft Authenticator app (via Entra Verified ID).

Admin Actions:
Reset Password: Generates a complex 14-character password.
Revoke & Reset MFA: Revokes user sessions and attempts to clear registered MFA methods to force a re-registration.

Prerequisites
1. Azure Subscription with an Active Directory (Entra ID) tenant.
2. Twilio Account (Account SID, Auth Token, and a Phone Number).
3. Azure App Service (to host the application).
4. Microsoft Entra Verified ID service enabled (optional, but required for the Digital ID flow).

Step 1: Azure App RegistrationYou need an App Registration to allow the app to read user data and perform resets.Go to Entra ID > App registrations > New registration.Name: IdentityManager-AppSupported account types: Accounts in this organizational directory only.Redirect URI (Web): https://<your-app-name>.azurewebsites.net/.auth/login/aad/callbackCertificates & secrets: Create a new Client Secret. Copy the Value immediately (you will need it later).API Permissions: Add the following Microsoft Graph permissions (Application type):User.Read.All (Read user profiles/phones)User.ReadWrite.All (Reset passwords)UserAuthenticationMethod.ReadWrite.All (Reset MFA)Important: Click "Grant admin consent for <Organization>" after adding them.

Step 2: Deployment to Azure App ServiceCreate a Node.js App Service in Azure.Deploy the code (VS Code extension, GitHub Actions, or Local Git).Go to Configuration > Environment variables and add the following:SettingValue DescriptionTENANT_IDYour Entra ID Tenant IDCLIENT_IDThe Application (client) ID from Step 1CLIENT_SECRETThe Secret Value from Step 1 AZURE_APP_URLhttps://<your-app-name>.azurewebsites.netTWILIO_ACCOUNT_SIDFrom Twilio ConsoleTWILIO_AUTH_TOKENFrom Twilio ConsoleTWILIO_PHONE_NUMBERYour Twilio Phone Number (e.g., +1555...)VERIFIER_AUTHORITY_DID(Optional) Your DID from Entra Verified ID settingsCREDENTIAL_TYPE(Optional) The VC type name (e.g., VerifiedEmployee)

Step 3: Secure with SSO (Authentication)This app must be protected so only IT Admins can access it.In your App Service, go to Settings > Authentication.Click Add identity provider > Microsoft.Select the App Registration you created in Step 1.Restrict access: Set to "Allow unauthenticated access".Why? The app handles authentication internally (server.js) to allow Twilio callbacks (robots) to bypass login while forcing humans (Admins) to sign in.

Step 4: Configure Verified ID (Optional)If using the "Digital ID" tab:Ensure you have a Verifiable Credential (like "VerifiedEmployee") published in Entra Verified ID.In the Verified ID settings, ensure your App Service URL is added as a trusted domain (optional but recommended).

Local Development:
1. Clone repository.
2. Run npm install.
3. Create a .env file with the variables listed in Step 2.
4. Run node server.js.

Note: Twilio callbacks and Verified ID callbacks will fail locally unless you use a tunnel like ngrok.

Troubleshooting:
"Payload Too Large" on Verified ID: Ensure your server middleware is set to accept large JSON bodies (included in this repo).

MFA Reset says "Failed": The API cannot delete "Default" or "System" methods (like Windows Hello). The tool performs a "Revoke Sessions" command which forces the user to re-register at next login, which effectively resets their security posture.
