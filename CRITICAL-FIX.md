# Critical Fix for 500 Error

## Problem

You're getting a 500 Internal Server Error when trying to initiate an M-Pesa payment. The common causes are:

1. **Backend code not deployed** - The fixes are local but not deployed to the VPS.
2. **Decimal amounts** - Promo codes can create decimal amounts, which must be rounded for M-Pesa.
3. **Missing error details** - Debugging is harder without useful backend logs.

## Production Domains

- M-Pesa backend: `https://epay.halaleventbrite.co.ke`
- Main website: `https://ticketing.halaleventbrite.co.ke`
- Mail domain: `mailer.halaleventbrite.co.ke`

## Quick Deploy Steps

1. Navigate to the backend directory:
   ```bash
   cd mpesa-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure production environment variables:
   ```bash
   MPESA_CALLBACK_URL=https://epay.halaleventbrite.co.ke/api/callback
   MAIN_WEBSITE_URL=https://ticketing.halaleventbrite.co.ke
   MAILER_DOMAIN=mailer.halaleventbrite.co.ke
   ```

4. Start or restart the VPS process:
   ```bash
   npm start
   ```

## Testing After Deployment

1. Confirm the backend responds:
   ```bash
   curl https://epay.halaleventbrite.co.ke/api/home
   ```

2. Test the STK endpoint:
   ```bash
   curl -X POST https://epay.halaleventbrite.co.ke/api/stkpush \
     -H "Content-Type: application/json" \
     -d '{"phone": "254712345678", "amount": 1009.80, "event": "Test Event", "ticketId": "test-ticket"}'
   ```

## What to Check if Still Getting 500 Error

1. Check VPS process logs, for example PM2 or systemd.
2. Confirm the M-Pesa callback URL is reachable.
3. Confirm M-Pesa credentials are valid.
4. Confirm phone numbers use Kenyan format: `254XXXXXXXXX`.
5. Confirm amounts are at least 1 KSH.

## Files Involved

- `mpesa-backend/api.js` - STK push, callback handling, receipt verification.
- `mpesa-backend/app.js` - Express server, CORS, VPS host/port binding.
- `mpesa-backend/.env` - Production environment values.
