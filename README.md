# SecureID
A lightweight web application for IT Helpdesks to verify user identities remotely and perform administrative actions (Password Resets, MFA clearing) securely.

Azure Identity Manager (Digital ID & MFA Reset Tool)
A lightweight web application for IT Helpdesks to verify user identities remotely and perform administrative actions (Password Resets, MFA clearing) securely.

Features
Phone Verification: Verify users by sending SMS or calling their file-on-record phone number (via Twilio).

Digital ID Verification: Verify users by scanning a QR code using their Microsoft Authenticator app (via Entra Verified ID).

Admin Actions:

Reset Password: Generates a complex 14-character password.

Revoke & Reset MFA: Revokes user sessions and attempts to clear registered MFA methods to force a re-registration.

Prerequisites
Azure Subscription with an Active Directory (Entra ID) tenant.

Twilio Account (Account SID, Auth Token, and a Phone Number).

Azure App Service (to host the application).

Microsoft Entra Verified ID service enabled (optional, but required for the Digital ID flow).
