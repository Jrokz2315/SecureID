# SecureID
A lightweight web application for IT Helpdesks to verify user identities remotely and perform administrative actions (Password Resets, MFA clearing) securely.

Azure Identity Manager (Digital ID & MFA Reset Tool)

A lightweight web application for IT Helpdesks to verify user identities remotely and perform administrative actions (Password Resets, MFA clearing) securely.

Features:

Phone Verification: Verify users by sending SMS or calling their file-on-record phone number (via Twilio).

Digital ID Verification: Verify users by scanning a QR code using their Microsoft Authenticator app (via Entra Verified ID). You can add FaceCheck if that is a preffered route with Digital ID ($0.25) per scan.

Admin Actions:

Verify user Identity: Pulls existing MFA registered methods and calls or texts the number on file to ensure identity. 

Reset Password: Generates a complex 14-character password.

Revoke & Reset MFA: Revokes user sessions and attempts to clear registered MFA methods to force a re-registration.

Prerequisites:
1. Azure Subscription with an Active Directory (Entra ID) tenant. - https://portal.azure.com/
2. Twilio Account (Account SID, Auth Token, and a Phone Number). - https://www.twilio.com/en-us
3. Microsoft Entra Verified ID service enabled (optional, but required for the Digital ID flow). - https://entra.microsoft.com/

Process:

Step 1: Create and Enterprise App with a name to your liking. Once created I like to go to Properties, set "Assignment Required = Yes and Visible to Users = No. Next under Users and Groups, create a new security group for the users you want to be able to access the app.

Next, Go to Azure App Registration.

A. Look for the APP you previously created,  Name: SecureID (Or whatever you set it to)

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

Step 2: Deployment to Azure App Service. 

A. Create a new Web App, create a new resource group for easy management, Name the app and select appropriate region. For Runtime Stack choose Node 22+. For the Plan I reccomend a Basic B1 sku at a minimum. 

B. Once the app is created, Go to Configuration > Environment variables and add the following Settings and Values. 
  1. TENANT_ID - Your Entra ID Tenant ID
  2. CLIENT_ID - The Application (client) ID from Step 1
  3. CLIENT_SECRET - The Secret Value from Step 1
  4. AZURE_APP_URL - https://<your-app-name>.azurewebsites.net
  5. TWILIO_ACCOUNT_SID - From Twilio Console
  6. TWILIO_AUTH_TOKEN - From Twilio Console
  7. TWILIO_PHONE_NUMBER - Your Twilio Phone Number (e.g., +1555...)
  8. VERIFIER_AUTHORITY_DID - (Optional) Your DID from Entra Verified ID settings (You can get back to this after step 5)
  9. WEBSITE_AUTH_AAD_ALLOWED_TENANTS - Your Entra ID Tenant ID and others separated with a comma (,) to limit access to the admin functions.
  10. MICROSOFT_PROVIDER_AUTHENTICATION_SECRET - This gets created automatically once you link the Web App to the Registered App. 

Step 3: Secure with SSO (Authentication). This app must be protected so only IT Admins can access it. 

  A. In your App Service, go to Settings > Authentication. Click Add identity provider > Microsoft. Select the App Registration you created in Step 1. 
  
  B. Restrict access: Set to "Allow unauthenticated access". Why? The app handles authentication internally (server.js) to allow Twilio callbacks (robots) to bypass login while forcing humans (Admins) to sign in.

Step 4: Copy the Web App "Default Domain" - https://<your-app-name>.azurewebsites.net/ and go back to your Registered App and under redirect URI paste https://<your-app-name>.azurewebsites.net/.auth/login/aad/callback and save. Under settings in the Redirect URI config, ensure the implicit grant and hybrid flows has ID tokens only checked. 

Step 5: Configure Verified ID (Optional) If using the "Digital ID" tab: Ensure you have a Verifiable Credential (like "VerifiedEmployee") published in Entra Verified ID. In the Verified ID settings, ensure your App Service URL is added as a trusted domain (optional but recommended). In simpler terms create a "Credential" in Entra under Verified ID

Step 6: Start your Web App. 

  A. Once started launch Kudu under Development Tools - Advanced Tools. 

  B. For simplicity once Kudu launches add /new ui to the URL - https://<your-app-name>.scm.canadacentral-01.azurewebsites.net/newui this will launch the new UI with easier navigation.

  C. On your computer, create a folder called public. Move the index.html inside this folder. 

  D. Now compress server.js, package.json and public into individual ZIP files

  E. In Kudu go to File Manager --> Site --> wwwroot and drop in all 3 compressed files. You should see package.json, server.js and a folder called public in there now. Ensure index.html in inside sometimes Azure moves it to a different directory. If it did compress         the index.html by itself and rop it in. 

Step 7: Dependencies instalations.

  A. Now that the files have been uploaded. Launch SSH from Kudu. 

  B. Chage directory into site/wwwroot

  C. run npm install - This will take some time.

Once it is installed, you can close Kudu. On the Web Apps main screen, restart the app (Give it 5 mins), once fully restarted click on your "Default Domain" link and your app should launch asking for SSO Authentication. 

Troubleshooting:
  1. "Payload Too Large" on Verified ID: Ensure your server middleware is set to accept large JSON bodies (included in this repo).
     
  2. MFA Reset says "Failed": The API cannot delete "Default" or "System" methods (like Windows Hello). The tool performs a "Revoke Sessions" command which forces the user to re-register at next login, which effectively resets their security posture.
