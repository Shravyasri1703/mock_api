import fs from "fs";
import path from "path";
import csv from "csv-parser";

const VALID_API_KEYS = ["tapm-test-key-123"];

let claimsCache = null;

// Load CSV once per cold start
async function loadClaims() {
  if (claimsCache) return claimsCache;

  const claims = [];
  const filePath = path.join(process.cwd(), "data", "claims.csv");

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => claims.push(row))
      .on("end", () => {
        claimsCache = claims;
        resolve(claims);
      })
      .on("error", reject);
  });
}

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

export default async function handler(req, res) {
  const apiKey = req.headers["x-api-key"];
  if (!VALID_API_KEYS.includes(apiKey)) {
    return res.status(401).json({ error: "Invalid API Key" });
  }

  const { claim_id, payer, service_date } = req.query;
  if (!claim_id || !payer || !service_date) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const claims = await loadClaims();

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
  res.status(200).send(buildX12(claim));
}
