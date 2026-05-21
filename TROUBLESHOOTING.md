# Troubleshooting M-Pesa Integration

## Common Issues and Solutions

### 1. 500 Internal Server Error

**Symptoms:**
- Error: "Failed to initiate payment"
- No M-Pesa prompt appears
- 500 status code in network tab

**Possible Causes & Solutions:**

#### A. Backend Not Deployed
- **Check:** Is the latest code deployed to Vercel?
- **Solution:** Deploy the updated backend code
  ```bash
  cd mpesa-backend
  npm install
  vercel --prod
  ```

#### B. Phone Number Format Issue
- **Check:** Phone number format in request
- **Solution:** Ensure phone number is in format: `0712345678` or `254712345678`
- The backend now automatically formats phone numbers

#### C. Amount Format Issue
- **Check:** Amount is a valid number > 0
- **Solution:** Ensure amount is sent as a number, not a string

#### D. M-Pesa API Credentials
- **Check:** Consumer key and secret are correct
- **Solution:** Verify credentials in `api.js` or use environment variables

#### E. Callback URL Not Accessible
- **Check:** Callback URL is publicly accessible
- **Solution:** Ensure `https://mpesa-backend-api.vercel.app/api/callback` is accessible

### 2. M-Pesa Prompt Not Appearing

**Symptoms:**
- Request succeeds (200 status) but no prompt on phone
- "Waiting for payment..." message appears

**Possible Causes & Solutions:**

#### A. Phone Number Not Registered with M-Pesa
- **Solution:** Ensure the phone number is registered with M-Pesa and has M-Pesa PIN set up

#### A. Wrong Phone Number Format
- **Solution:** Phone must be in format `254712345678` (no spaces, dashes, or +)

#### B. Insufficient Balance
- **Solution:** Ensure the M-Pesa account has sufficient balance

#### C. M-Pesa API Error
- **Check:** Check backend logs for M-Pesa API error response
- **Solution:** Review error message from M-Pesa API in server logs

### 3. Payment Status Not Updating

**Symptoms:**
- Payment completed but status shows "pending"
- `/paymentStatus` endpoint returns "Payment Pending"

**Possible Causes & Solutions:**

#### A. Callback Not Received
- **Check:** Check if callback URL is accessible
- **Solution:** Verify callback endpoint is working and receiving requests

#### B. File System Issues (Vercel)
- **Issue:** Vercel serverless functions have read-only filesystem (except /tmp)
- **Solution:** Consider using a database (Firestore, MongoDB) instead of file system for storing payment data

### 4. Debugging Steps

1. **Check Browser Console:**
   - Look for detailed error messages
   - Check network tab for request/response details

2. **Check Backend Logs:**
   - Vercel Dashboard → Functions → View Logs
   - Look for error messages and stack traces

3. **Test Endpoint Directly:**
   ```bash
   curl -X POST https://mpesa-backend-api.vercel.app/api/stkpush \
     -H "Content-Type: application/json" \
     -d '{"phone": "254712345678", "amount": 100, "event": "Test"}'
   ```

4. **Check M-Pesa API Response:**
   - Look for `ResponseCode` in M-Pesa API response
   - `0` = Success
   - Other codes indicate errors (check M-Pesa API documentation)

### 5. Environment Variables (Recommended)

For production, use environment variables instead of hardcoded credentials:

1. Add to Vercel Dashboard → Settings → Environment Variables:
   - `MPESA_CONSUMER_KEY`
   - `MPESA_CONSUMER_SECRET`
   - `MPESA_SHORTCODE`
   - `MPESA_PASSKEY`

2. Update `api.js` to use:
   ```javascript
   const consumer_key = process.env.MPESA_CONSUMER_KEY;
   const consumer_secret = process.env.MPESA_CONSUMER_SECRET;
   ```

### 6. Testing Checklist

- [ ] Backend deployed to Vercel
- [ ] Phone number format correct (254XXXXXXXXX)
- [ ] Amount is valid number > 0
- [ ] M-Pesa credentials are correct
- [ ] Callback URL is accessible
- [ ] Phone number is registered with M-Pesa
- [ ] M-Pesa account has balance
- [ ] Check browser console for errors
- [ ] Check Vercel function logs

