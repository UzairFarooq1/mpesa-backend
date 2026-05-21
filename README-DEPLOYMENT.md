# M-Pesa Backend Deployment Guide

## Changes Made

1. **Fixed hardcoded amount**: Changed from `"1"` to use actual amount from request
2. **Added error handling**: Proper error responses when access token fails
3. **Added input validation**: Validates phone number and amount
4. **Added `/paymentStatus` endpoint**: New endpoint for checking payment status
5. **Updated callback URL**: Changed to use deployed backend URL
6. **Added moment dependency**: Added missing moment package

## Deployment to VPS

### Production Domains

- M-Pesa backend: `https://epay.halaleventbrite.co.ke`
- Main website: `https://ticketing.halaleventbrite.co.ke`
- Mail domain: `mailer.halaleventbrite.co.ke`

### Deploy

1. Navigate to the mpesa-backend directory:
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

4. Start the app on the VPS:
   ```bash
   npm start
   ```

### Important Notes

- The backend URL should be: `https://epay.halaleventbrite.co.ke`
- The M-Pesa callback URL should be: `https://epay.halaleventbrite.co.ke/api/callback`
- Payment callbacks are stored in Firestore.

## Testing After Deployment

1. Test the `/api/stkpush` endpoint:
   ```bash
   curl -X POST https://epay.halaleventbrite.co.ke/api/stkpush \
     -H "Content-Type: application/json" \
     -d '{"phone": "254712345678", "amount": 100, "event": "Test Event"}'
   ```

2. Test the `/paymentStatus` endpoint:
   ```bash
   curl https://epay.halaleventbrite.co.ke/paymentStatus
   ```

## Troubleshooting

If you get a 500 error:
1. Check VPS process logs
2. Ensure `moment` package is installed (check package.json)
3. Verify the callback URL is accessible
4. Check that M-Pesa API credentials are correct

