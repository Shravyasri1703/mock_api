const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
const PORT = 3000;

const VALID_API_KEYS = ["tapm-test-key-123"];
let claims = [];

// Load CSV
fs.createReadStream("./data/claims.csv")
  .pipe(csv())
  .on("data", (row) => claims.push(row))
  .on("end", () => console.log("Claims loaded"));

// API key middleware
app.use((req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!VALID_API_KEYS.includes(apiKey)) {
    return res.status(401).json({ error: "Invalid API Key" });
  }
  next();
});

// Build simplified X12
function buildX12(claim) {
  let denialSegment = "";

  if (claim.status === "DENIED") {
    denialSegment = `DEN*${claim.denial_code}*${claim.denial_description}~`;
  }

  return `
ISA*00* *00* *ZZ*MOCKAPI *ZZ*CLIENT *250119*1200*^*00501*000000111*0*T*:~
GS*HN*MOCKAPI*CLIENT*20250119*1200*1*X*005010X212~
ST*277*0001~
BHT*0010*08*${claim.claim_id}*20250119*1200~
CLM*${claim.claim_id}*${claim.charge_amount}~
STS*${claim.status}~
${denialSegment}
DTM*232*${claim.payment_date || ""}~
PAY*INS*${claim.ins_paid}~
PAY*PAT*${claim.pat_resp}~
PAY*PROV*${claim.prov_writeoff}~
SE*10*0001~
GE*1*1~
IEA*1*000000111~`.trim();
}

// Endpoint
app.get("/v1/claim-status", (req, res) => {
  const { claim_id, payer, service_date } = req.query;

  if (!claim_id || !payer || !service_date) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const claim = claims.find(
    (c) =>
      c.claim_id === claim_id &&
      c.payer === payer &&
      c.service_date === service_date
  );

  if (!claim) {
    return res.status(404).json({ error: "Claim not found" });
  }

  res.setHeader("Content-Type", "application/EDI-X12");
  res.send(buildX12(claim));
});

// Health check
app.get("/health", (_, res) => {
  res.json({ status: "UP" });
});

app.listen(PORT, () => {
  console.log(`Mock X12 API running at http://localhost:${PORT}`);
});
