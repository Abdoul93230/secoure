# QuickAuth Postman - Guide rapide

## Fichier
- QuickAuth.postman_collection.json

## Import
1. Ouvrir Postman.
2. Importer le fichier QuickAuth.postman_collection.json.

## Variables importantes
- baseUrl
- phone
- email
- name
- password

## Ordre recommande
1. 1. Check Phone
2. 2. Send OTP
3. 3. Verify OTP
4. 4. Quick Register
5. 5. Login With Phone
6. 6. Verify Access Token

## Notes dev
- En mode developpement, la reponse Send OTP peut inclure data.devOTP.
- La collection capture automatiquement devOTP dans la variable otpCode.

## Tests anti-abus
- Lancer 2. Send OTP plusieurs fois rapidement pour verifier le cooldown.
- Lancer 3. Verify OTP avec mauvais code pour verifier attemptsRemaining.
- Lancer 7. Resend OTP apres cooldown pour verifier la regeneration.
