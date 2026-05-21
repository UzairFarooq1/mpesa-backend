require("dotenv").config();

const express = require("express");
const flash = require("connect-flash");
const router = express.Router();
router.use(flash());
const axios = require("axios");
const moment = require("moment");
const session = require("express-session");
const admin = require("firebase-admin");

router.use(
  session({
    cookie: { maxAge: 60000 },
    secret: process.env.SESSION_SECRET || "woot",
    resave: false,
    saveUninitialized: false,
  }),
);

function initializeFirebaseAdmin() {
  if (admin.apps.length) return admin.firestore();

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (serviceAccountJson || serviceAccountBase64) {
    const rawServiceAccount =
      serviceAccountJson ||
      Buffer.from(serviceAccountBase64, "base64").toString("utf8");

    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(rawServiceAccount)),
      projectId: process.env.FIREBASE_PROJECT_ID || "halaleventbrite",
    });
  } else {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "halaleventbrite",
    });
  }

  return admin.firestore();
}

const db = initializeFirebaseAdmin();
const FieldValue = admin.firestore.FieldValue;

const MPESA_BASE_URL =
  process.env.MPESA_BASE_URL || "https://api.safaricom.co.ke";
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;
const MPESA_CALLBACK_URL =
  process.env.MPESA_CALLBACK_URL ||
  "https://epay.halaleventbrite.co.ke/api/callback";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeReceiptCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
}

function getCallbackMetadataValue(items, name) {
  return items.find((item) => item.Name === name)?.Value;
}

function normalizeMpesaPhone(phoneNumber) {
  let phone = String(phoneNumber || "").replace(/\D/g, "");

  if (phone.length < 9 || phone.length > 12) {
    throw new Error("Invalid phone number format");
  }

  if (phone.startsWith("0")) {
    phone = "254" + phone.slice(1);
  } else if (phone.startsWith("254")) {
    // Already normalized.
  } else if (phone.length === 9) {
    phone = "254" + phone;
  } else {
    throw new Error(
      "Invalid phone number format. Use format: 0712345678 or 254712345678",
    );
  }

  return phone;
}

function normalizeAmount(amount) {
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!numeric || isNaN(numeric) || numeric <= 0) {
    throw new Error("Valid amount is required (must be greater than 0)");
  }

  const roundedAmount = Math.ceil(numeric);
  if (roundedAmount < 1) {
    throw new Error("Amount must be at least 1 KSH");
  }

  return roundedAmount;
}

function normalizeTicketIds(body) {
  const ticketIds = Array.isArray(body.ticketIds)
    ? body.ticketIds
    : body.ticketId
      ? [body.ticketId]
      : [];

  return ticketIds.filter(Boolean).map(String);
}

function validatePaymentAmount(payment, expectedAmount) {
  if (expectedAmount == null || expectedAmount === "") return null;

  const paidAmount = Number(payment.amount);
  const expected = Math.ceil(Number(expectedAmount));

  if (isNaN(expected) || expected <= 0) return null;
  if (isNaN(paidAmount) || paidAmount <= 0) return null;

  if (paidAmount < expected) {
    return `Payment amount (Ksh ${paidAmount}) is less than order total (Ksh ${expected})`;
  }

  return null;
}

async function getAccessToken() {
  const consumerKey = requireEnv("MPESA_CONSUMER_KEY");
  const consumerSecret = requireEnv("MPESA_CONSUMER_SECRET");
  const url = `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;
  const auth =
    "Basic " +
    Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    console.log("Requesting access token from M-Pesa...");
    const response = await axios.get(url, {
      headers: { Authorization: auth },
      timeout: 10000,
    });

    if (!response.data?.access_token) {
      console.error("Invalid access token response:", response.data);
      throw new Error(
        "Invalid response from M-Pesa API: No access token received",
      );
    }

    console.log("Access token retrieved successfully");
    return response.data.access_token;
  } catch (error) {
    console.error("Error getting access token:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });
    throw error;
  }
}

async function getPaymentByReceipt(receiptCode) {
  const normalized = normalizeReceiptCode(receiptCode);
  if (!normalized) return null;

  const receiptSnap = await db.collection("receipts").doc(normalized).get();
  if (receiptSnap.exists) {
    return receiptSnap.data();
  }

  const paymentSnap = await db
    .collection("payments")
    .where("mpesaReceiptNumber", "==", normalized)
    .limit(1)
    .get();

  if (!paymentSnap.empty) {
    return paymentSnap.docs[0].data();
  }

  return null;
}

async function getPaymentStatus(query) {
  if (query.receipt) {
    return getPaymentByReceipt(query.receipt);
  }

  if (query.checkoutRequestID) {
    const snap = await db
      .collection("payments")
      .doc(String(query.checkoutRequestID))
      .get();
    return snap.exists ? snap.data() : null;
  }

  if (query.merchantRequestID) {
    const snap = await db
      .collection("payments")
      .where("merchantRequestID", "==", String(query.merchantRequestID))
      .limit(1)
      .get();
    return snap.empty ? null : snap.docs[0].data();
  }

  if (query.ticketId) {
    const snap = await db
      .collection("payments")
      .where("ticketIds", "array-contains", String(query.ticketId))
      .limit(1)
      .get();
    return snap.empty ? null : snap.docs[0].data();
  }

  return null;
}

router.get("/api/home", (req, res) => {
  res.json({ message: "This is a sample API route." });
});

router.get("/api/access_token", async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    res.json({ message: "Your access token is " + accessToken });
  } catch (error) {
    res.status(500).json({
      status: false,
      msg: error.message || "Failed to get access token from M-Pesa",
    });
  }
});

router.post("/api/stkpush", async (req, res) => {
  try {
    const phoneNumber = normalizeMpesaPhone(req.body.phone);
    const roundedAmount = normalizeAmount(req.body.amount);
    const event = req.body.event || "Event Payment";
    const ticketIds = normalizeTicketIds(req.body);
    const ticketId = ticketIds[0] || null;

    if (!ticketIds.length) {
      return res.status(400).json({
        msg: "At least one ticketId is required",
        status: false,
      });
    }

    const shortcode = requireEnv("MPESA_SHORTCODE");
    const passkey = requireEnv("MPESA_PASSKEY");
    const accessToken = await getAccessToken();
    const url = `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`;
    const timestamp = moment().format("YYYYMMDDHHmmss");
    const password = Buffer.from(
      `${shortcode}${passkey}${timestamp}`,
    ).toString("base64");
    const amountString = String(roundedAmount);

    console.log("Sending STK Push to M-Pesa:", {
      phoneNumber,
      amount: amountString,
      timestamp,
      callbackURL: MPESA_CALLBACK_URL,
      ticketIds,
    });

    const response = await axios.post(
      url,
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amountString,
        PartyA: phoneNumber,
        PartyB: shortcode,
        PhoneNumber: phoneNumber,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: ticketId,
        TransactionDesc: event,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (response.data?.ResponseCode && response.data.ResponseCode !== "0") {
      const errorMsg =
        response.data.CustomerMessage ||
        response.data.errorMessage ||
        "M-Pesa request failed";

      return res.status(400).json({
        msg: errorMsg,
        status: false,
        mpesaResponse: response.data,
      });
    }

    const merchantRequestID = response.data.MerchantRequestID;
    const checkoutRequestID = response.data.CheckoutRequestID;

    if (!checkoutRequestID) {
      throw new Error("M-Pesa response did not include CheckoutRequestID");
    }

    await db.collection("payments").doc(checkoutRequestID).set({
      checkoutRequestID,
      merchantRequestID,
      ticketId,
      ticketIds,
      amount: roundedAmount,
      phone: phoneNumber,
      event,
      status: "pending",
      mpesaResponse: response.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      msg: "Request is successful. Please enter your M-Pesa PIN to complete the transaction.",
      status: true,
      checkoutRequestID,
      merchantRequestID,
      data: response.data,
    });
  } catch (error) {
    console.error("STK Push Error Details:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
      stack: error.stack,
    });

    const errorMessage =
      error.response?.data?.errorMessage ||
      error.response?.data?.CustomerMessage ||
      error.message ||
      "Request failed";

    res.status(500).json({
      msg: errorMessage,
      status: false,
      error: error.response?.data || error.message,
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

router.post("/api/callback", async (req, res) => {
  try {
    console.log("STK PUSH CALLBACK", req.body);

    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback) {
      return res
        .status(400)
        .json({ message: "stkCallback not found in request body" });
    }

    const merchantRequestID = stkCallback.MerchantRequestID;
    const checkoutRequestID = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;
    const callbackItems = stkCallback.CallbackMetadata?.Item || [];
    const amount = getCallbackMetadataValue(callbackItems, "Amount");
    const rawReceipt = getCallbackMetadataValue(
      callbackItems,
      "MpesaReceiptNumber",
    );
    const mpesaReceiptNumber = normalizeReceiptCode(rawReceipt);
    const transactionDate = getCallbackMetadataValue(
      callbackItems,
      "TransactionDate",
    );
    const phoneNumber = getCallbackMetadataValue(callbackItems, "PhoneNumber");
    const paid = resultCode === 0 || resultCode === "0";
    const paymentRef = db.collection("payments").doc(checkoutRequestID);
    const paymentSnap = await paymentRef.get();
    const previousPayment = paymentSnap.exists ? paymentSnap.data() : {};

    const callbackRecord = {
      merchantRequestID,
      checkoutRequestID,
      resultCode,
      resultDesc,
      amount: amount ?? null,
      mpesaReceiptNumber: mpesaReceiptNumber || null,
      transactionDate: transactionDate ?? null,
      phoneNumber: phoneNumber ?? null,
      rawBody: req.body,
      receivedAt: FieldValue.serverTimestamp(),
    };

    await db.collection("callbacks").doc(checkoutRequestID).set(callbackRecord);

    await paymentRef.set(
      {
        ...callbackRecord,
        status: paid ? "paid" : "failed",
        paidAt: paid ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (paid && mpesaReceiptNumber) {
      const receiptRecord = {
        ...previousPayment,
        ...callbackRecord,
        status: "paid",
        ticketId: previousPayment.ticketId || null,
        ticketIds: previousPayment.ticketIds || [],
        indexedAt: FieldValue.serverTimestamp(),
      };

      await db.collection("receipts").doc(mpesaReceiptNumber).set(receiptRecord);

      await Promise.all(
        (previousPayment.ticketIds || []).map((id) =>
          db.collection("tickets").doc(String(id)).set(
            {
              ticketId: String(id),
              checkoutRequestID,
              merchantRequestID,
              mpesaReceiptNumber,
              status: "paid",
              paidAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          ),
        ),
      );
    }

    res.status(200).json({ message: "Callback processed successfully" });
  } catch (error) {
    console.error("Callback processing error:", error);
    res.status(500).json({
      message: "Failed to process callback",
      error: error.message,
    });
  }
});

router.get("/api/paidtickets", async (req, res) => {
  try {
    const payment = await getPaymentStatus(req.query);
    if (!payment || payment.status !== "paid") {
      return res.status(404).json({ error: "No paid ticket found" });
    }

    res.json({
      ticketId: payment.ticketId,
      ticketIds: payment.ticketIds || [],
      mpesaReceiptNumber: payment.mpesaReceiptNumber,
      checkoutRequestID: payment.checkoutRequestID,
    });
  } catch (error) {
    console.error("Error reading paid tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api/verify-receipt", async (req, res) => {
  try {
    const receiptCode = req.body.receiptCode || req.body.receipt;
    const expectedAmount = req.body.amount;

    if (!receiptCode) {
      return res.status(400).json({
        status: false,
        msg: "M-Pesa receipt code is required",
      });
    }

    const normalized = normalizeReceiptCode(receiptCode);
    if (normalized.length < 8 || normalized.length > 12) {
      return res.status(400).json({
        status: false,
        msg: "Invalid receipt code. Use the code from your M-Pesa confirmation SMS (e.g. QJK1ABC2DE).",
      });
    }

    const payment = await getPaymentByReceipt(normalized);
    if (!payment) {
      return res.status(404).json({
        status: false,
        msg: "No payment found for this receipt code. Check the code from your M-Pesa SMS and try again in a minute if you just paid.",
      });
    }

    if (
      payment.resultCode != null &&
      payment.resultCode !== 0 &&
      payment.resultCode !== "0"
    ) {
      return res.status(400).json({
        status: false,
        msg: "This M-Pesa transaction was not successful",
      });
    }

    const amountError = validatePaymentAmount(payment, expectedAmount);
    if (amountError) {
      return res.status(400).json({
        status: false,
        msg: amountError,
      });
    }

    return res.json({
      status: true,
      message: "Successful Payment",
      mpesaReceipt: payment.mpesaReceiptNumber,
      amount: payment.amount,
      phoneNumber: payment.phoneNumber,
      transactionDate: payment.transactionDate,
      checkoutRequestID: payment.checkoutRequestID,
      merchantRequestID: payment.merchantRequestID,
      ticketId: payment.ticketId,
      ticketIds: payment.ticketIds || [],
    });
  } catch (error) {
    console.error("Verify receipt error:", error);
    res.status(500).json({
      status: false,
      msg: "Failed to verify receipt. Please try again.",
    });
  }
});

router.get("/paymentStatus", async (req, res) => {
  try {
    const payment = await getPaymentStatus(req.query);

    if (
      payment &&
      (payment.status === "paid" ||
        payment.resultCode === 0 ||
        payment.resultCode === "0")
    ) {
      return res.json({
        message: "Successful Payment",
        mpesaReceipt: payment.mpesaReceiptNumber,
        checkoutRequestID: payment.checkoutRequestID,
        merchantRequestID: payment.merchantRequestID,
        status: "success",
      });
    }

    if (payment && payment.status === "failed") {
      return res.json({
        message: payment.resultDesc || "Payment failed",
        status: "failed",
      });
    }

    res.json({
      message: "Payment Pending",
      status: "pending",
    });
  } catch (error) {
    console.error("Error reading payment status:", error);
    res.json({
      message: "Payment Pending",
      status: "pending",
    });
  }
});

module.exports = router;
