# Réactivation du canal OTP WhatsApp (Fronts)

> **État au 21/09/2026 : MASQUÉ côté fronts.**
> Raison : le WABA « Ihambaobab » (34557793653868169) est en statut `ONBOARDING`
> et `health_status.can_send_message = BLOCKED` (erreur Meta **141008** — "The WABA
> status is not active"). Aucun envoi WhatsApp n'est possible tant que Meta n'a pas
> activé le compte. Vérifier avec : `node secoure/test_whatsapp_health.js`

Le **backend est déjà prêt** (service actif + routage `channel` + repli SMS automatique) :
il bascule sur SMS si `channel: "whatsapp"` échoue. Il est donc sans effet tant que
les fronts n'envoient pas ce paramètre.

## Procédure quand le WABA sera ACTIVE

1. Contrôle préalable :
   ```powershell
   cd secoure
   node test_whatsapp_health.js   # doit afficher : WABA status ACTIVE + can_send_message AVAILABLE
   node test_whatsapp_scopes.js   # doit afficher : whatsapp_business_messaging: ["34557793653868169"]
   node test_whatsapp_otp.js      # envoi réel de contrôle
   ```
2. Réappliquer les 5 modifications front ci-dessous (dans l'ordre).
3. Déployer les fronts.

## 1. `iham_baobab_web_nextjs/src/components/auth/QuickAuth.tsx`

**a) État du canal** (ligne ~65) — remplacer :
```tsx
  // const [otpChannel, setOtpChannel] = useState<"sms" | "whatsapp">("sms"); // DÉSACTIVÉ
  const otpChannel = "sms" as const;
```
par :
```tsx
  const [otpChannel, setOtpChannel] = useState<"sms" | "whatsapp">("sms");
```

**b) Import icône** (bloc `lucide-react`) — ajouter `MessageCircle,` à la liste.

**c) Envoi inscription** (~ligne 188/192) — ajouter `channel: otpChannel` au body et
`channel: data?.data?.channel || otpChannel` dans `buildVerifyUrl`.

**d) Envoi mot de passe oublié** (~ligne 203/207) — idem.

**e) Sélecteur UI** (~ligne 403) — remplacer le bloc commenté
`{/* Canal OTP — WhatsApp DÉSACTIVÉ ... */}` par le vrai sélecteur : 2 boutons
`grid grid-cols-2 gap-3`, styles `h-[44px] rounded-xl border ...`,
actif SMS = `border-[#30A08B] bg-[#30A08B]/10 text-[#30A08B]`,
actif WhatsApp = `border-[#25D366] bg-[#25D366]/10 text-[#25D366]`,
icônes `Phone` (SMS) et `MessageCircle` (WhatsApp).

## 2. `iham_baobab_web_nextjs/src/components/auth/VerifyOTP.tsx`

**a) Canal depuis l'URL** (~ligne 58) — remplacer :
```tsx
  // const channel = (searchParams.get("channel") || "sms") as "sms" | "whatsapp"; // DÉSACTIVÉ
  const channel = "sms" as "sms" | "whatsapp";
```
par :
```tsx
  const channel = (searchParams.get("channel") || "sms") as "sms" | "whatsapp";
```

**b) Renvoi en flux mot de passe oublié** (~ligne 155) — `{ phone }` → `{ phone, channel }`.

**c) Affichage du canal** (~ligne 314) — décommenter le ternaire
`channel === "whatsapp" ? (📱 via WhatsApp) : (💬 par SMS)`.

## 3. `SellerMobileApp/src/screens/RegisterScreen.js`

**a) Option de méthode** (~ligne 494) — décommenter :
```js
            { v: 'whatsapp', icon: 'logo-whatsapp', label: 'WhatsApp' },
```

**b) Icône du chip récapitulatif** (~ligne 520) — passer à :
```js
<Ionicons name={method === 'email' ? 'mail-outline' : method === 'whatsapp' ? 'logo-whatsapp' : 'phone-portrait-outline'} size={16} color={PRIMARY} />
```

**c) (Optionnel)** `<Text style={[st.methodLabel, ...]} numberOfLines={1}>` pour éviter
le retour à la ligne avec 3 boutons.

## Emplacements non traités (à faire si souhaité)

- `Sellers/src/Admin/SellerSetInfo/ImprovedRegistrationForm.jsx` : n'a jamais eu d'option
  WhatsApp (Email/Téléphone seulement). Le backend accepte déjà `method: 'whatsapp'` sur
  `/auth/register-otp/*` — ajouter un 3ᵉ bouton `{ v: 'whatsapp', icon: MessageCircle, label: 'WhatsApp' }`.
- `SellerMobileApp/.../ForgotPasswordScreen.js` : utilise `/forgotPassword_seller`
  (flux `secoure/src/auth/forgotPassword.js`) — support WhatsApp à ajouter côté backend.
- `New_Iham_Baobab_Mobile` : ne transmet pas `channel` (SMS par défaut).

## Scripts de diagnostic disponibles (`secoure/`)

| Script | Rôle |
|---|---|
| `test_whatsapp_health.js` | État WABA/numéro + `can_send_message` (le plus important) |
| `test_whatsapp_otp.js` | Envoi réel d'un OTP (`--dry` pour simuler) |
| `test_whatsapp_scopes.js` | Scopes granulaires du token vs WABA |
| `test_whatsapp_waba_check.js` | Quel WABA possède le numéro + apps rattachées |
| `test_whatsapp_diag.js` | Validité du token + numéro expéditeur |
