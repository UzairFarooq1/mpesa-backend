/*
  Author: Alvin Kiveu
  Description: Mpesa Daraja API with Node JS
  Date: 23/10/2023
  Github Link: https://github.com/alvin-kiveu/Mpesa-Daraja-Api-NODE.JS.git
  Website: www.umeskiasoftwares.com
  Email: info@umeskiasoftwares.com
  Phone: +254113015674
  
*/

require("dotenv").config();

const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const axios = require("axios"); // Import 'axios' instead of 'request'
const moment = require("moment");
const apiRouter = require("./api");
const cors = require("cors");
const app = express();

const port = process.env.PORT || 3070;
const hostname = process.env.HOST || "0.0.0.0";
const mainWebsiteUrl =
  process.env.MAIN_WEBSITE_URL || "https://ticketing.halaleventbrite.co.ke";
const mpesaCallbackUrl =
  process.env.MPESA_CALLBACK_URL ||
  "https://epay.halaleventbrite.co.ke/api/callback";

const allowedOrigins = [
  process.env.MAIN_WEBSITE_URL,
  "https://ticketing.halaleventbrite.co.ke",
  "https://halaleventbrite.co.ke",
  "https://www.halaleventbrite.co.ke", // add if applicable
  "http://localhost:5173",
  "http://localhost:5174",
]
  .filter(Boolean)
  .map((o) => o.replace(/\/$/, ""));

const corsOptions = {
  origin(origin, callback) {
    // allow server-side requests / mobile apps
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/$/, "");

    if (allowedOrigins.includes(normalized)) {
      return callback(null, true);
    }

    console.log("Blocked Origin:", origin);

    callback(new Error(`CORS blocked origin: ${origin}`));
  },

  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use((req, res, next) => {
  console.log(req.method, req.url);
  console.log("Origin:", req.headers.origin);
  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use("/", apiRouter);

const server = http.createServer(app);

const MPESA_BASE_URL =
  process.env.MPESA_BASE_URL || "https://api.safaricom.co.ke";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// ACCESS TOKEN FUNCTION - Updated to use 'axios'
async function getAccessToken() {
  const consumer_key = requireEnv("MPESA_CONSUMER_KEY");
  const consumer_secret = requireEnv("MPESA_CONSUMER_SECRET");
  const url = `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;
  const auth =
    "Basic " +
    new Buffer.from(consumer_key + ":" + consumer_secret).toString("base64");

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: auth,
      },
    });

    const dataresponse = response.data;
    // console.log(data);
    const accessToken = dataresponse.access_token;
    return accessToken;
  } catch (error) {
    throw error;
  }
}

app.get("/", (req, res) => {
  res.send("MPESA DARAJA API WITH NODE JS BY UMESKIA SOFTWARES");
  var timeStamp = moment().format("YYYYMMDDHHmmss");
  console.log(timeStamp);
});

//ACCESS TOKEN ROUTE
app.get("/access_token", (req, res) => {
  getAccessToken()
    .then((accessToken) => {
      res.send("😀 Your access token is " + accessToken);
    })
    .catch(console.log);
});

//MPESA STK PUSH ROUTE
app.get("/stkpush", (req, res) => {
  getAccessToken()
    .then((accessToken) => {
      const url = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
      const auth = "Bearer " + accessToken;
      const timestamp = moment().format("YYYYMMDDHHmmss");
      const shortcode = requireEnv("MPESA_SHORTCODE");
      const passkey = requireEnv("MPESA_PASSKEY");
      const password = new Buffer.from(
        shortcode + passkey + timestamp,
      ).toString("base64");

      axios
        .post(
          url,
          {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: "1",
            PartyA: "254791495274", //phone number to receive the stk push
            PartyB: shortcode,
            PhoneNumber: "254791495274",
            CallBackURL: mpesaCallbackUrl,
            AccountReference: "UMESKIA PAY",
            TransactionDesc: "Mpesa Daraja API stk push test",
          },
          {
            headers: {
              Authorization: auth,
            },
          },
        )
        .then((response) => {
          res.send(
            "😀 Request is successful done ✔✔. Please enter mpesa pin to complete the transaction",
          );
        })
        .catch((error) => {
          console.log(error);
          res.status(500).send("❌ Request failed");
        });
    })
    .catch(console.log);
});

//STK PUSH CALLBACK ROUTE
app.post("/callback", (req, res) => {
  console.log("STK PUSH CALLBACK");
  console.log(req.body);
  res.status(410).json({
    message: "Use /api/callback. Payment callbacks are stored in Firestore.",
  });
});

// REGISTER URL FOR C2B
app.get("/registerurl", (req, resp) => {
  getAccessToken()
    .then((accessToken) => {
      const url = "https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl";
      const auth = "Bearer " + accessToken;
      axios
        .post(
          url,
          {
            ShortCode: requireEnv("MPESA_SHORTCODE"),
            ResponseType: "Completed",
            ConfirmationURL: "https://epay.halaleventbrite.co.ke/confirmation",
            ValidationURL: "https://epay.halaleventbrite.co.ke/validation",
          },
          {
            headers: {
              Authorization: auth,
            },
          },
        )
        .then((response) => {
          resp.status(200).json(response.data);
        })
        .catch((error) => {
          console.log(error);
          resp.status(500).send("❌ Request failed");
        });
    })
    .catch(console.log);
});

app.get("/confirmation", (req, res) => {
  console.log("All transaction will be sent to this URL");
  console.log(req.body);
});

app.get("/validation", (req, resp) => {
  console.log("Validating payment");
  console.log(req.body);
});

// B2C ROUTE OR AUTO WITHDRAWAL
app.get("/b2curlrequest", (req, res) => {
  getAccessToken()
    .then((accessToken) => {
      const securityCredential =
        "N3Lx/hisedzPLxhDMDx80IcioaSO7eaFuMC52Uts4ixvQ/Fhg5LFVWJ3FhamKur/bmbFDHiUJ2KwqVeOlSClDK4nCbRIfrqJ+jQZsWqrXcMd0o3B2ehRIBxExNL9rqouKUKuYyKtTEEKggWPgg81oPhxQ8qTSDMROLoDhiVCKR6y77lnHZ0NU83KRU4xNPy0hRcGsITxzRWPz3Ag+qu/j7SVQ0s3FM5KqHdN2UnqJjX7c0rHhGZGsNuqqQFnoHrshp34ac/u/bWmrApUwL3sdP7rOrb0nWasP7wRSCP6mAmWAJ43qWeeocqrz68TlPDIlkPYAT5d9QlHJbHHKsa1NA==";
      const url = "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest";
      const auth = "Bearer " + accessToken;
      axios
        .post(
          url,
          {
            InitiatorName: "testapi",
            SecurityCredential: securityCredential,
            CommandID: "PromotionPayment",
            Amount: "1",
            PartyA: "600996",
            PartyB: "", //phone number to receive the stk push
            Remarks: "Withdrawal",
            QueueTimeOutURL: "https://epay.halaleventbrite.co.ke/b2c/queue",
            ResultURL: "https://epay.halaleventbrite.co.ke/b2c/result",
            Occasion: "Withdrawal",
          },
          {
            headers: {
              Authorization: auth,
            },
          },
        )
        .then((response) => {
          res.status(200).json(response.data);
        })
        .catch((error) => {
          console.log(error);
          res.status(500).send("❌ Request failed");
        });
    })
    .catch(console.log);
});

// Only start the server when this file is run directly on the VPS.
if (require.main === module) {
  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}

// Export app for serverless wrappers or tests.
module.exports = app;
