# LAfricaMobile SMS integration (QuickAuth)

## What is connected
- Backend only: SMS send is done in `secoure/src/auth/quickAuthController.js`.
- Endpoints now sending real SMS via LAfricaMobile:
  - `POST /auth/send-otp`
  - `POST /auth/resend-otp`
  - `POST /auth/request-password-reset-otp`
- Web and mobile already use these endpoints, so no frontend provider integration is required.

## Environment variables
Use the backend `.env`:

- `LAFRICA_SMS_ENABLED=true`
- `LAFRICA_SMS_BASE_URL=https://lamsms.lafricamobile.com`
- `LAFRICA_SMS_SENDER=IHAMBAOBAB`

Credentials can be provided in either set below:

- Preferred:
  - `LAFRICA_SMS_ACCOUNT_ID`
  - `LAFRICA_SMS_PASSWORD`
- Existing fallback (already present):
  - `ACCESS_KEY_AFRICAMOBILE`
  - `ACCESS_PASSWORD_AFRICAMOBILE`

## Sender constraints
- Must not start with a digit.
- Max length: 11 characters.
- Allowed: letters, numbers, underscore.

## Testing with your 5 SMS credits
Suggested validation order:

1. `POST /auth/send-otp` with one valid phone.
2. `POST /auth/verify-otp` with received code.
3. `POST /auth/request-password-reset-otp` for same phone.
4. `POST /auth/resend-otp` (after cooldown) to verify resend flow.
5. One final `POST /auth/send-otp` on another phone to confirm full path.

## Notes
- If SMS provider fails, API now returns `502` and OTP is not persisted as sent.
- `devOTP` is disabled in API responses. OTP is delivered only through SMS provider.
