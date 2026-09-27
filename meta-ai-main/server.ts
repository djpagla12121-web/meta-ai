import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ==================== CONFIG ====================
const FIREBASE_URL = "https://bota-e4eda-default-rtdb.firebaseio.com";
const MAX_BULK = 5;

// ==================== FIREBASE HELPERS ====================
async function fbGet(pathStr: string) {
  try {
    const res = await axios.get(`${FIREBASE_URL}/${pathStr.replace(/^\//, "")}.json`, { timeout: 10000 });
    if (res.status === 200) return res.data;
  } catch (e) {
    // ignore
  }
  return null;
}

async function fbPatch(pathStr: string, data: any) {
  try {
    const res = await axios.patch(`${FIREBASE_URL}/${pathStr.replace(/^\//, "")}.json`, data, { timeout: 10000 });
    return res.status === 200;
  } catch (e) {
    return false;
  }
}

// ==================== PROXY CONFIG ====================
interface ProxyConfig {
  enabled: boolean;
  ip: string;
  port: string;
  username: string;
  password: string;
  use_for_otp: boolean;
}

let PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  ip: "",
  port: "",
  username: "",
  password: "",
  use_for_otp: false,
};

function getProxyUrl(): string | null {
  if (!PROXY_CONFIG.enabled || !PROXY_CONFIG.ip || !PROXY_CONFIG.port) {
    return null;
  }
  let auth = "";
  if (PROXY_CONFIG.username && PROXY_CONFIG.password) {
    auth = `${encodeURIComponent(PROXY_CONFIG.username)}:${encodeURIComponent(PROXY_CONFIG.password)}@`;
  }
  return `http://${auth}${PROXY_CONFIG.ip}:${PROXY_CONFIG.port}`;
}

function getProxyAgent(useProxy = true) {
  const pUrl = useProxy ? getProxyUrl() : null;
  if (!pUrl) return null;
  if (pUrl.startsWith("socks")) {
    return new SocksProxyAgent(pUrl);
  }
  return new HttpsProxyAgent(pUrl);
}

async function resolveIpGeo(ipStr: string) {
  if (!ipStr) return { country: "Unknown", country_code: "", isp: "" };
  try {
    const res = await axios.get(`http://ip-api.com/json/${ipStr}?fields=status,country,countryCode,query,isp`, { timeout: 6000 });
    if (res.data && res.data.status === "success") {
      return {
        country: res.data.country || "Unknown",
        country_code: (res.data.countryCode || "").toUpperCase(),
        isp: res.data.isp || "",
      };
    }
  } catch (e) {}

  try {
    const res2 = await axios.get(`https://ipwho.is/${ipStr}`, { timeout: 6000 });
    if (res2.data && res2.data.success) {
      return {
        country: res2.data.country || "Unknown",
        country_code: (res2.data.country_code || "").toUpperCase(),
        isp: res2.data.connection?.isp || "",
      };
    }
  } catch (e) {}

  return { country: "Unknown", country_code: "", isp: "" };
}

async function getCurrentIpInfo(useProxy = false) {
  if (!PROXY_CONFIG.enabled || !PROXY_CONFIG.ip || !PROXY_CONFIG.port) {
    return {
      success: false,
      ip: "",
      country: "",
      country_code: "",
      isp: "",
      is_proxy: false,
    };
  }

  const agent = getProxyAgent(true);
  const geo = await resolveIpGeo(PROXY_CONFIG.ip);

  if (agent) {
    const config: any = { timeout: 8000, httpsAgent: agent, httpAgent: agent };
    try {
      const res = await axios.get("http://ip-api.com/json/?fields=status,country,countryCode,query,isp", config);
      if (res.status === 200 && res.data && res.data.status === "success" && res.data.query) {
        return {
          success: true,
          ip: res.data.query || PROXY_CONFIG.ip,
          country: res.data.country || geo.country,
          country_code: (res.data.countryCode || geo.country_code || "").toUpperCase(),
          isp: res.data.isp || geo.isp,
          is_proxy: true,
        };
      }
    } catch (e) {}
  }

  return {
    success: true,
    ip: PROXY_CONFIG.ip,
    country: geo.country || "Unknown",
    country_code: geo.country_code || "",
    isp: geo.isp || "",
    is_proxy: true,
  };
}

// ==================== HELPERS ====================
function generateRandomToken(length = 24): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function parseMetaResponse(text: string) {
  let clean = (typeof text === "string" ? text : JSON.stringify(text)).trim();
  if (clean.startsWith("for (;;);")) {
    clean = clean.substring("for (;;);".length);
  }
  try {
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

function extractTokensAndUid(html: string) {
  let fb_dtsg = "";
  let lsd = "";
  let actor_id = "";

  const dtsgPatterns = [
    /\["DTSGInitialData",\[\],\{"token":"([^"]+)"\}/,
    /name="fb_dtsg"\s+value="([^"]+)"/,
    /"token":"(NAf[^"]+)"/,
  ];
  for (const p of dtsgPatterns) {
    const m = html.match(p);
    if (m) {
      fb_dtsg = m[1];
      break;
    }
  }

  const lsdPatterns = [
    /\["LSD",\[\],\{"token":"([^"]+)"\}/,
    /name="lsd"\s+value="([^"]+)"/,
    /"token":"([0-9a-zA-Z_\-]{20,})"/,
  ];
  for (const p of lsdPatterns) {
    const m = html.match(p);
    if (m) {
      lsd = m[1];
      break;
    }
  }

  const actPatterns = [
    /"ACCOUNT_ID":"(\d+)"/,
    /"USER_ID":"(\d+)"/,
    /"actor_id":"(\d+)"/,
  ];
  for (const p of actPatterns) {
    const m = html.match(p);
    if (m && m[1] !== "0") {
      actor_id = m[1];
      break;
    }
  }

  return { fb_dtsg, lsd, actor_id };
}

function classifyCreateResponse(statusCode: number, data: any, rawText: string) {
  if (!data) {
    if (rawText.includes("uid")) {
      const m = rawText.match(/"uid":\s*"?(\d+)"?/);
      if (m) return { success: true, reason: m[1] };
    }
    return { success: false, reason: "Unable to parse response" };
  }
  const payload = data.payload || {};
  if (typeof payload === "object" && payload.uid) {
    return { success: true, reason: String(payload.uid) };
  }
  if (data.error) {
    return { success: false, reason: data.errorDescription || data.errorSummary || "Unknown error" };
  }
  return { success: false, reason: "Unknown response" };
}

function calculateJazoest(token: string): string {
  if (!token) return "25584";
  let sum = 0;
  for (let i = 0; i < token.length; i++) {
    sum += token.charCodeAt(i);
  }
  return "2" + sum;
}

// ==================== META API HEADERS & CONSTANTS ====================
const TARGET_CREATE_URL = "https://auth.meta.com/login/device-based/register-save-credentials/";
const TARGET_CONFIRM_URL = "https://auth.meta.com/api/graphql/";

const HEADERS_CREATE = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12; itel S665L Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.87 Mobile Safari/537.36",
  "Accept-Encoding": "gzip, deflate",
  "Content-Type": "application/x-www-form-urlencoded",
  "sec-ch-ua": '"Chromium";v="152", "Not?A_Brand";v="24", "Android WebView";v="152"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "x-asbd-id": "359341",
  "x-fb-lsd": "AdRLdRXnKs4_RAGnmEr-k2XaQu0",
  "origin": "https://auth.meta.com",
  "x-requested-with": "mark.via.gp",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "referer": "https://auth.meta.com/",
  "accept-language": "en-US,en;q=0.9",
  "priority": "u=1, i",
};

const HEADERS_CONFIRM = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12; itel S665L Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.87 Mobile Safari/537.36",
  "Accept-Encoding": "gzip, deflate",
  "Content-Type": "application/x-www-form-urlencoded",
  "sec-ch-ua-platform": '"Android"',
  "sec-ch-ua": '"Chromium";v="152", "Not?A_Brand";v="24", "Android WebView";v="152"',
  "x-fb-friendly-name": "FRLConfirmEmailMutation",
  "sec-ch-ua-mobile": "?1",
  "x-asbd-id": "359341",
  "origin": "https://auth.meta.com",
  "x-requested-with": "mark.via.gp",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "accept-language": "en-US,en;q=0.9",
  "priority": "u=1, i",
};

const HEADERS_TEMPMAIL = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12; itel S665L Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.87 Mobile Safari/537.36",
  "Accept-Encoding": "gzip, deflate",
  "sec-ch-ua-platform": '"Android"',
  "sec-ch-ua": '"Chromium";v="152", "Not?A_Brand";v="24", "Android WebView";v="152"',
  "sec-ch-ua-mobile": "?1",
  "x-requested-with": "mark.via.gp",
  "origin": "https://instanttempemail.com",
  "referer": "https://instanttempemail.com/",
};

const TEMPTF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12; itel S665L Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.39 Mobile Safari/537.36",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "sec-ch-ua-platform": '"Android"',
  "sec-ch-ua": '"Android WebView";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
  "sec-ch-ua-mobile": "?1",
  "X-Requested-With": "mark.via.gp",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  "Referer": "https://temp.tf/",
  "Accept-Language": "en-US,en;q=0.9",
};

const BASE_FORM_CREATE: Record<string, string> = {
  consent_version: "",
  contact_point_type: "EMAIL_ADDRESS",
  csi: "Scd0BS3l-yOix38o6lNKa_kT",
  date_of_birth: "1993-09-11",
  device_id: "",
  fb_encrypted_access_token: "",
  fb_oidc_access_token: "",
  first_name: "Ajs",
  google_id_token: "",
  has_youth_consent: "false",
  ig_encrypted_access_token: "",
  ig_encrypted_auth_header: "",
  ig_oidc_access_token: "",
  last_name: "Sjs",
  opt_into_marketing: "true",
  password: "",
  reg_integrity: "Q8W2BTuKa24cQO_B6qvNeGtvmIjuAiCCCvXaCbgkwfWbqt-rPjXJArjnIu5K2myj2GHMJPPSr6BbjXBUFU17JuiZ3IvWTGB_fpfbXwr1sq6qX5lwBCHho2TWDE4ACpgpKGop91SIXofE0KTu2MBkdW1Ss0D6TG7isv6lz2N1CLlYDcRuoiMmSnzt_3_tNldGlheeYm1KVKQyQckdk6G2PoiceW2vxKWbivZ6HJPdq-QsNs4JB7yqEnYY2B3u6mfepC066IZYhv9ZgWpXIuYUsgim6pBbL6NyF84-UsOy8kYIOZlCHc_2PFK4SRPhdx0RMJipGYiIeb5y-Nwj_VHS1Tc2es-jc6aZ7hlBsBokGAeo-cnYEERpIKXz_OnmFTc48WHp2nMcJxww|kregenc",
  should_save_credentials: "true",
  waterfall_id: "701777af-c668-4a8d-976a-0c0f619d807a",
  caa_event_flow: "ntf",
  entry_point: "login_home",
  event_client_time: "1789066665.654",
  is_kadabra_zero: "false",
  regulation_jurisdiction: '["BD"]',
  qpl_join_id: "ff52ee3c05b3ec955",
  __user: "0",
  __a: "1",
  __req: "1q",
  __rev: "1047214234",
  lsd: "AdRLdRXnKs4_RAGnmEr-k2XaQu0",
  jazoest: "22293",
  __spin_r: "1047214234",
  __spin_b: "trunk",
  __spin_t: "1789066629",
  __jssesw: "1",
};

// ==================== TEMP MAIL SERVICES ====================
async function instantCreate(): Promise<{ email: string; token: string; provider: string } | null> {
  try {
    const agent = getProxyAgent(true);
    const config: any = { headers: HEADERS_TEMPMAIL, timeout: 10000 };
    if (agent) {
      config.httpsAgent = agent;
      config.httpAgent = agent;
    }
    const resp = await axios.post("https://instanttempemail.com/api/create", {}, config);
    if (resp.status === 200 && resp.data && resp.data.address) {
      return { email: resp.data.address, token: resp.data.token || "", provider: "instant" };
    }
  } catch (e) {}
  return null;
}

async function instantInbox(token: string): Promise<any[]> {
  if (!token) return [];
  try {
    const agent = getProxyAgent(true);
    const config: any = { headers: HEADERS_TEMPMAIL, timeout: 10000 };
    if (agent) {
      config.httpsAgent = agent;
      config.httpAgent = agent;
    }
    const resp = await axios.get(`https://instanttempemail.com/api/inbox/${token}`, config);
    if (resp.status === 200 && resp.data && resp.data.emails) {
      return resp.data.emails;
    }
  } catch (e) {}
  return [];
}

async function temptfCreate(): Promise<{ email: string; token: string; provider: string } | null> {
  try {
    const resp = await axios.get("https://temp.tf/api/account?providers=high.edu.pl&dot=0&plus=0", {
      headers: TEMPTF_HEADERS,
      timeout: 15000,
    });
    if (resp.status === 200 && resp.data && resp.data.email && resp.data.email.includes("@")) {
      return { email: resp.data.email, token: resp.data.email, provider: "temptf" };
    }
  } catch (e) {}
  return null;
}

async function temptfInbox(token: string): Promise<any[]> {
  const email = token;
  if (!email || !email.includes("@")) return [];
  try {
    const headers = { ...TEMPTF_HEADERS, "Content-Type": "application/json", Origin: "https://temp.tf" };
    const resp = await axios.post("https://temp.tf/api/check", { email, wait: false }, { headers, timeout: 15000 });
    if (resp.status === 200 && resp.data && Array.isArray(resp.data.data)) {
      return resp.data.data.map((m: any) => ({
        subject: m.subject || "",
        body_text: m.body || "",
        body_html: m.body || "",
      }));
    }
  } catch (e) {}
  return [];
}

const PROVIDER_MAP: Record<string, { create: () => Promise<any>; inbox: (token: string) => Promise<any[]> }> = {
  temptf: { create: temptfCreate, inbox: temptfInbox },
  instant: { create: instantCreate, inbox: instantInbox },
};

const TEMPMAIL_PROVIDERS: Record<string, { name: string; desc: string; badge: string }> = {
  temptf: { name: "Temp.tf", desc: "high.edu.pl • Default", badge: "⚡" },
  instant: { name: "InstantTempEmail", desc: "Fast & Reliable", badge: "🔥" },
};

let CURRENT_PROVIDER = "temptf";

async function createTempMail(provider = "temptf") {
  const fn = PROVIDER_MAP[provider]?.create;
  if (fn) {
    try {
      const res = await fn();
      if (res && res.email) return res;
    } catch (e) {}
  }
  const other = provider === "temptf" ? "instant" : "temptf";
  try {
    const res2 = await PROVIDER_MAP[other]?.create();
    if (res2 && res2.email) return res2;
  } catch (e) {}
  return null;
}

async function fetchInboxEmails(token: string, provider = "temptf") {
  const fn = PROVIDER_MAP[provider]?.inbox;
  if (!fn) return [];
  try {
    return (await fn(token)) || [];
  } catch (e) {
    return [];
  }
}

// ==================== META CREATOR & CONFIRMATION ====================
async function createMetaAccount(email: string, passwordStr: string) {
  const data = new URLSearchParams();
  for (const [k, v] of Object.entries(BASE_FORM_CREATE)) {
    data.append(k, v);
  }
  data.set("contact_point", email);
  data.set("password", passwordStr);
  data.set(
    "redirect_uri",
    "https://auth.meta.com/recover/success/?redirect_uri=https%3A%2F%2Fauth.meta.com%2Foidc%3Fapp_id%3D1522763855472543"
  );

  const agent = getProxyAgent(true);
  const config: any = {
    headers: HEADERS_CREATE,
    timeout: 25000,
    validateStatus: () => true,
  };
  if (agent) {
    config.httpsAgent = agent;
    config.httpAgent = agent;
  }

  try {
    const resp = await axios.post(TARGET_CREATE_URL, data.toString(), config);
    const parsed = parseMetaResponse(resp.data);
    const { success, reason } = classifyCreateResponse(resp.status, parsed, typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data));

    const setCookies = resp.headers["set-cookie"] || [];
    const fullC: Record<string, string> = {
      datr: generateRandomToken(24),
      ps_l: "1",
      ps_n: "1",
      locale: "en_GB",
    };
    for (const c of setCookies) {
      const match = c.match(/^([^=]+)=([^;]+)/);
      if (match) {
        fullC[match[1]] = match[2];
      }
    }
    const cookieStr = Object.entries(fullC)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    let extractedUid = "";
    if (parsed && typeof parsed.payload === "object" && parsed.payload.uid) {
      extractedUid = String(parsed.payload.uid);
    } else if (success && /^\d+$/.test(reason)) {
      extractedUid = reason;
    }

    if (!success || !extractedUid) {
      return { success: false, message: reason };
    }

    const savedCsi = BASE_FORM_CREATE.csi;
    const savedWf = BASE_FORM_CREATE.waterfall_id;
    const confirmLink = `https://auth.meta.com/register/confirm/?redirect_uri=https%3A%2F%2Fauth.meta.com%2Foidc%2F%3Fapp_id%3D1522763855472543&waterfall_id=${savedWf}&csi=${savedCsi}&event_flow=login_manual`;

    let liveDtsg = "";
    let liveLsd = "";
    let pageUid = "";
    try {
      const confRes = await axios.get(confirmLink, {
        headers: {
          ...HEADERS_CONFIRM,
          Cookie: cookieStr,
          referer: confirmLink,
        },
        timeout: 15000,
        httpsAgent: agent,
        httpAgent: agent,
      });
      const ext = extractTokensAndUid(typeof confRes.data === "string" ? confRes.data : "");
      liveDtsg = ext.fb_dtsg;
      liveLsd = ext.lsd;
      pageUid = ext.actor_id;
    } catch (e) {}

    const finalUid = extractedUid || pageUid;

    return {
      success: true,
      email,
      uid: finalUid,
      password: passwordStr,
      cookie: cookieStr,
      csi: savedCsi,
      waterfall_id: savedWf,
      fb_dtsg: liveDtsg,
      lsd: liveLsd,
      confirm_link: confirmLink,
    };
  } catch (e: any) {
    return { success: false, message: e.message || "Meta request failed" };
  }
}

async function confirmMetaOtp(sessionData: any, otpCode: string, useProxy = false) {
  try {
    const actorId = sessionData.uid;
    const cookie = sessionData.cookie;
    const savedCsi = sessionData.csi;
    const savedWf = sessionData.waterfall_id;
    const fbDtsg = sessionData.fb_dtsg || "NAfw3-iVgzAwb3wze6-QRU-d6X36d-knUVwny-8I9gCaoBHl9mph0_A:16:1789089771";
    const lsd = sessionData.lsd || "mVvZ2A2krrrCYh31NtUS0j";
    const jazoest = calculateJazoest(fbDtsg);

    const vPayload = {
      input: {
        confirmation_code: { sensitive_string_value: String(otpCode) },
        confirmation_code_type: "OTP_CODE",
        event_flow: "login_manual",
        rl_client_session_id: savedCsi,
        waterfall_id: savedWf,
        source_app_id: "1522763855472543",
        qpl_join_id: `f${crypto.randomBytes(8).toString("hex")}`,
        actor_id: String(actorId),
        client_mutation_id: "1",
      },
    };

    const fData = new URLSearchParams();
    fData.append("av", String(actorId));
    fData.append("__user", "0");
    fData.append("__a", "1");
    fData.append("__req", "g");
    fData.append("__hs", "20707.HYP:frl_comet_auth_pkg.2.1...0");
    fData.append("dpr", "2");
    fData.append("__ccg", "MODERATE");
    fData.append("__rev", "1047236770");
    fData.append("fb_dtsg", fbDtsg);
    fData.append("jazoest", jazoest);
    fData.append("lsd", lsd);
    fData.append("variables", JSON.stringify(vPayload));
    fData.append("doc_id", "9851798224911796");

    const agent = useProxy ? getProxyAgent(true) : null;
    const config: any = {
      headers: {
        ...HEADERS_CONFIRM,
        Cookie: cookie,
        "x-fb-lsd": lsd,
        referer: sessionData.confirm_link,
      },
      timeout: 30000,
      validateStatus: () => true,
    };
    if (agent) {
      config.httpsAgent = agent;
      config.httpAgent = agent;
    }

    const cResp = await axios.post(TARGET_CONFIRM_URL, fData.toString(), config);
    const parsed = parseMetaResponse(typeof cResp.data === "string" ? cResp.data : JSON.stringify(cResp.data));
    const confirmInfo = parsed?.data?.confirm_email || {};
    const confirmed = confirmInfo.isConfirmed === true;
    const confirmedId = confirmed ? (confirmInfo.accountId || actorId) : actorId;

    return { confirmed, uid: confirmedId, raw: typeof cResp.data === "string" ? cResp.data : JSON.stringify(cResp.data) };
  } catch (e: any) {
    return { confirmed: false, uid: sessionData.uid || "0", raw: `Error: ${e.message?.substring(0, 200)}` };
  }
}

// ==================== IN-MEMORY BATCH & SESSIONS ====================
const SESSIONS: Record<string, any> = {};
const BATCHES: Record<string, any> = {};

async function createOneAccount(passwordStr: string, provider = "temptf") {
  const result: any = {
    success: false,
    status: "failed",
    email: "",
    password: passwordStr,
    uid: "",
    otp: "",
    message: "",
    provider,
  };

  const tempData = await createTempMail(provider);
  if (!tempData || !tempData.email) {
    result.message = "Temp mail create failed";
    return result;
  }

  const tempEmail = tempData.email;
  const tempToken = tempData.token || "";
  const actualProvider = tempData.provider || provider;
  result.email = tempEmail;
  result.provider = actualProvider;

  const meta = await createMetaAccount(tempEmail, passwordStr);
  if (!meta || !meta.success) {
    result.message = meta?.message || "Meta create failed";
    return result;
  }

  result.uid = meta.uid || "";

  let otpCode: string | null = null;
  let checkpoint = false;

  for (let attempt = 0; attempt < 30; attempt++) {
    const emails = await fetchInboxEmails(tempToken, actualProvider);
    for (const em of emails) {
      if (!em || typeof em !== "object") continue;
      const body = `${em.body_text || ""} ${em.body_html || ""}`;
      const subj = em.subject || "";

      if (body.includes("Confirm that you're human") || subj.includes("Action needed")) {
        checkpoint = true;
        break;
      }

      const patterns = [
        /Confirmation code\s*[:\s]*(\d{6})/i,
        /letter-spacing:\s*2px;[^>]*>\s*(\d{6})\s*</,
        /font-size:\s*24px[^>]*>\s*(\d{6})\s*</,
        /\b(\d{6})\b/,
      ];

      for (const p of patterns) {
        const m = body.match(p);
        if (m) {
          otpCode = m[1];
          break;
        }
      }
      if (otpCode) break;
    }

    if (otpCode || checkpoint) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (checkpoint) {
    result.status = "checkpoint";
    result.message = "Checkpoint detected";
    return result;
  }

  if (!otpCode) {
    result.status = "otp_timeout";
    result.message = "OTP not found in inbox";
    return result;
  }

  result.otp = otpCode;
  const useProxyForOtp = PROXY_CONFIG.use_for_otp;

  const confirm = await confirmMetaOtp(meta, otpCode, useProxyForOtp);
  if (confirm && confirm.confirmed) {
    result.success = true;
    result.status = "success";
    result.uid = confirm.uid || result.uid;
    result.message = "Confirmed";
  } else {
    result.status = "confirm_failed";
    result.message = "OTP confirm failed";
  }

  return result;
}

async function runBulk(batchId: string) {
  const batch = BATCHES[batchId];
  if (!batch) return;
  const passwordStr = batch.password || "";
  const provider = batch.provider || "temptf";

  for (const acc of batch.accounts || []) {
    try {
      acc.status = "processing";
      const r = await createOneAccount(passwordStr, provider);
      acc.email = r.email || "";
      acc.uid = r.uid || "";
      acc.confirmed_uid = r.success ? r.uid : "";
      acc.status = r.status || "failed";
    } catch (e) {
      acc.status = "failed";
    }
  }
  batch.done = true;
}

// ==================== API ROUTES ====================

// 1. Login
app.post("/api/login", async (req, res) => {
  const key = (req.body?.key || "").trim().toUpperCase();
  if (!key) {
    return res.json({ success: false, message: "No key" });
  }
  const info = await fbGet(`keys/${key}`);
  if (!info) {
    return res.json({ success: false, message: "Invalid key" });
  }
  if (info.active === false) {
    return res.json({ success: false, message: "Key deactivated" });
  }
  await fbPatch(`keys/${key}`, { last_login: new Date().toISOString() });
  return res.json({ success: true, info });
});

// 2. Activation Status
app.get("/api/activation_status", async (req, res) => {
  const key = (req.query?.key as string || "").trim().toUpperCase();
  if (!key) return res.json({ active: false });

  const allActs = (await fbGet("activation_keys")) || {};
  let best: any = null;
  const now = Date.now() / 1000;

  for (const [ak, ainfo] of Object.entries(allActs)) {
    if (!ainfo || typeof ainfo !== "object") continue;
    const a = ainfo as any;
    if (a.login_key !== key) continue;
    const expTs = a.expire_ts || 0;
    if (expTs > now && (!best || expTs > (best.expire_ts || 0))) {
      best = { ...a, key: ak };
    }
  }

  if (!best) return res.json({ active: false });

  return res.json({
    active: true,
    key: best.key || "",
    package: best.package || "",
    expire_ts: best.expire_ts || 0,
    expire: best.expire || "",
  });
});

// 3. My Keys
app.get("/api/my_keys", async (req, res) => {
  const key = (req.query?.key as string || "").trim().toUpperCase();
  if (!key) return res.json({ success: false });

  const allUsers = (await fbGet("users")) || {};
  let user: any = null;
  for (const [uid, u] of Object.entries(allUsers)) {
    if (u && typeof u === "object" && (u as any).login_key === key) {
      user = u;
      break;
    }
  }

  if (!user) return res.json({ success: false });

  const keysList = Array.isArray(user.activated_keys) ? user.activated_keys : [];
  const now = Date.now() / 1000;
  const result = [];

  for (const ak of keysList) {
    const ainfo = (await fbGet(`activation_keys/${ak}`)) || {};
    const expTs = ainfo.expire_ts || 0;
    const active = expTs > now;
    let remText = "";
    if (active) {
      const rem = Math.floor(expTs - now);
      const d = Math.floor(rem / 86400);
      const h = Math.floor((rem % 86400) / 3600);
      const m = Math.floor((rem % 3600) / 60);
      remText = `${d}d ${h}h ${m}m`;
    }
    result.push({
      key: ak,
      package: ainfo.package || "-",
      active,
      remaining_text: remText,
    });
  }

  return res.json({ success: true, keys: result });
});

// 4. Set Activation Key
app.post("/api/set_activation", async (req, res) => {
  const loginKey = (req.body?.login_key || "").trim().toUpperCase();
  const actKey = (req.body?.activation_key || "").trim().toUpperCase();
  if (!loginKey || !actKey) {
    return res.json({ success: false, message: "Missing params" });
  }

  const ainfo = await fbGet(`activation_keys/${actKey}`);
  if (!ainfo) {
    return res.json({ success: false, message: "Invalid activation key" });
  }
  if (ainfo.login_key && ainfo.login_key !== loginKey) {
    return res.json({ success: false, message: "Key belongs to another user" });
  }
  if ((ainfo.expire_ts || 0) < Date.now() / 1000) {
    return res.json({ success: false, message: "Activation key expired" });
  }

  return res.json({ success: true, message: "Activation key verified!", package: ainfo.package || "" });
});

// 5. Providers
app.get("/api/providers", (req, res) => {
  const result = Object.entries(TEMPMAIL_PROVIDERS).map(([pid, info]) => ({
    id: pid,
    name: info.name,
    desc: info.desc,
    badge: info.badge,
  }));
  return res.json({ providers: result, current: CURRENT_PROVIDER });
});

// 6. Set Provider
app.post("/api/set_provider", (req, res) => {
  const p = (req.body?.provider || "").trim();
  if (!TEMPMAIL_PROVIDERS[p]) {
    return res.json({ success: false, message: "Unknown provider" });
  }
  CURRENT_PROVIDER = p;
  return res.json({ success: true, provider: p });
});

// 7. IP Info
app.get("/api/ip_info", async (req, res) => {
  const useProxy = req.query?.use_proxy === "1" || PROXY_CONFIG.enabled;
  const info = await getCurrentIpInfo(useProxy);
  return res.json(info);
});

// 8. Set Proxy & Check Proxy
app.post("/api/set_proxy", async (req, res) => {
  const data = req.body || {};
  if (!data.enabled) {
    PROXY_CONFIG = { enabled: false, ip: "", port: "", username: "", password: "", use_for_otp: false };
    return res.json({ success: true, message: "Disabled" });
  }

  PROXY_CONFIG = {
    enabled: true,
    ip: (data.ip || "").trim(),
    port: String(data.port || "").trim(),
    username: (data.username || "").trim(),
    password: (data.password || "").trim(),
    use_for_otp: Boolean(data.use_for_otp),
  };

  const info = await getCurrentIpInfo(true);
  return res.json({
    success: true,
    message: `Connected: ${info.ip} (${info.country})`,
    ip: info.ip,
    country: info.country,
    country_code: info.country_code,
  });
});

// 9. Bulk Create
app.post("/api/bulk_create", async (req, res) => {
  const passwordStr = (req.body?.password || "").trim();
  const count = parseInt(req.body?.count || "1", 10);
  let provider = (req.body?.provider || "temptf").trim();
  if (!TEMPMAIL_PROVIDERS[provider]) provider = "temptf";

  if (!passwordStr || passwordStr.length < 6) {
    return res.json({ success: false, message: "Password min 6" });
  }
  if (count < 1 || count > MAX_BULK) {
    return res.json({ success: false, message: `1-${MAX_BULK}` });
  }

  const batchId = generateRandomToken(12);
  BATCHES[batchId] = {
    accounts: Array.from({ length: count }, (_, i) => ({
      index: i + 1,
      status: "pending",
      email: "",
      uid: "",
      session_id: "",
      confirmed_uid: "",
    })),
    done: false,
    password: passwordStr,
    provider,
  };

  runBulk(batchId);

  return res.json({
    success: true,
    batch_id: batchId,
    count,
    provider_name: TEMPMAIL_PROVIDERS[provider].name,
  });
});

// 11. Bulk Status
app.get("/api/bulk_status", (req, res) => {
  const batchId = req.query?.batch as string || "";
  const batch = BATCHES[batchId];
  if (!batch) return res.json({ error: "not found" });

  const accounts = (batch.accounts || []).map((a: any) => ({
    index: a.index || 0,
    status: a.status || "unknown",
    email: a.email || "",
    password: batch.password || "",
    uid: a.confirmed_uid || a.uid || "",
    session_id: a.session_id || "",
  }));

  return res.json({ accounts, done: Boolean(batch.done) });
});

// 12. Manual Create
app.post("/api/manual_create", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim();
    const passwordStr = (req.body?.password || "").trim();
    if (!email || !email.includes("@")) {
      return res.json({ success: false, message: "Invalid email" });
    }
    if (!passwordStr || passwordStr.length < 6) {
      return res.json({ success: false, message: "Password min 6" });
    }

    const result = await createMetaAccount(email, passwordStr);
    if (!result || !result.success) {
      return res.json({ success: false, message: result?.message || "Failed" });
    }

    const sid = generateRandomToken(16);
    SESSIONS[sid] = result;
    return res.json({
      success: true,
      session: sid,
      email: result.email || email,
      uid: result.uid || "",
      password: result.password || passwordStr,
    });
  } catch (e: any) {
    return res.json({ success: false, message: `Error: ${e.message?.substring(0, 200)}` });
  }
});

// 13. Confirm Manual OTP
app.post("/api/confirm", async (req, res) => {
  try {
    const sid = req.body?.session || "";
    const otp = (req.body?.otp || "").replace(/\D/g, "");
    if (!sid || !otp) {
      return res.json({ confirmed: false, raw: "Missing params" });
    }
    const sessionData = SESSIONS[sid];
    if (!sessionData) {
      return res.json({ confirmed: false, raw: "Session expired" });
    }

    const result = await confirmMetaOtp(sessionData, otp, PROXY_CONFIG.use_for_otp);
    if (result && result.confirmed) {
      return res.json({ confirmed: true, uid: result.uid || "" });
    }
    return res.json({ confirmed: false, raw: result?.raw?.substring(0, 300) || "Failed" });
  } catch (e: any) {
    return res.json({ confirmed: false, raw: `Error: ${e.message?.substring(0, 200)}` });
  }
});

// 14. Telegram Bot Avatar
app.get("/api/bot_avatar", async (req, res) => {
  const BOT_TOKEN = "8602647816:AAFXDQHWxcTtK39kJ6yuk4QkoZhmj1LsVWc";
  try {
    const userRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, { timeout: 8000 });
    const botId = userRes.data?.result?.id;
    if (botId) {
      const photosRes = await axios.get(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${botId}&limit=1`,
        { timeout: 8000 }
      );
      const photos = photosRes.data?.result?.photos;
      if (photos && photos.length > 0 && photos[0].length > 0) {
        const fileId = photos[0][photos[0].length - 1].file_id;
        const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`, {
          timeout: 8000,
        });
        const filePath = fileRes.data?.result?.file_path;
        if (filePath) {
          const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
          return res.json({ success: true, photo_url: directUrl });
        }
      }
    }
  } catch (e) {}

  return res.json({ success: true, photo_url: "https://t.me/i/userpic/320/Meta_Power_BOT.jpg" });
});

// ==================== APP START ====================
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, () => {
      console.log(`Tools Website Server listening on port ${PORT}`);
    });
  }
}

start();

export default app;
