import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

interface UserInfo {
  name?: string;
  username?: string;
  balance?: number | string;
  refer?: number | string;
  key?: string;
  role?: string;
}

interface ActivationData {
  active: boolean;
  key?: string;
  package?: string;
  expire_ts?: number;
  expire?: string;
}

interface UserKeyItem {
  key: string;
  package: string;
  active: boolean;
  remaining_text: string;
}

interface ProviderItem {
  id: string;
  name: string;
  desc: string;
  badge: string;
}

interface BulkAccountRow {
  index: number;
  status: string;
  email: string;
  password?: string;
  uid: string;
  session_id?: string;
}

export default function App() {
  // Screen state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginKey, setLoginKey] = useState("");
  const [loginKeyInput, setLoginKeyInput] = useState("");
  const [loginStatus, setLoginStatus] = useState<{ text: string; type: "info" | "ok" | "error" } | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // User state
  const [userInfo, setUserInfo] = useState<UserInfo>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<"dashboard" | "activation" | "meta" | "proxy">("dashboard");

  // IP Chip state
  const [ipInfo, setIpInfo] = useState<{
    text: string;
    flag: string;
    countryCode: string;
    isProxy: boolean;
  }>({ text: "Checking...", flag: "🌐", countryCode: "", isProxy: false });

  // Dashboard / Activation state
  const [actStatus, setActStatus] = useState<ActivationData | null>(null);
  const [countdown, setCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const timerRef = useRef<any>(null);

  // Activation Page state
  const [actKeyInput, setActKeyInput] = useState("");
  const [actSetStatus, setActSetStatus] = useState<{ text: string; type: "info" | "ok" | "error" } | null>(null);
  const [myKeys, setMyKeys] = useState<UserKeyItem[]>([]);

  // Meta Page state
  const [metaTab, setMetaTab] = useState<"auto" | "manual">("auto");
  const [bulkCount, setBulkCount] = useState(4);
  const [autoPassword, setAutoPassword] = useState("");
  const [createStatus, setCreateStatus] = useState<{ text: string; type: "info" | "ok" | "error" } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkAccounts, setBulkAccounts] = useState<BulkAccountRow[]>([]);
  const [collectedEmails, setCollectedEmails] = useState<string[]>([]);
  const [copyAllBtnText, setCopyAllBtnText] = useState("📋 COPY ALL EMAILS");
  const [copyAllCopied, setCopyAllCopied] = useState(false);

  // Manual Meta state
  const [manualEmail, setManualEmail] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [manualSession, setManualSession] = useState("");
  const [manualOtp, setManualOtp] = useState("");
  const [manualOtpStatus, setManualOtpStatus] = useState<{ text: string; type: "info" | "ok" | "error" } | null>(null);
  const [manualConfirming, setManualConfirming] = useState(false);

  // Provider modal state
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<ProviderItem[]>([
    { id: "temptf", name: "Temp.tf", desc: "high.edu.pl • Default", badge: "⚡" },
    { id: "instant", name: "InstantTempEmail", desc: "Fast & Reliable", badge: "🔥" }
  ]);
  const [selectedProvider, setSelectedProvider] = useState("temptf");
  const [currentProvider, setCurrentProvider] = useState<ProviderItem>({
    id: "temptf",
    name: "Temp.tf",
    desc: "high.edu.pl • Default",
    badge: "⚡"
  });
  const [providerStatus, setProviderStatus] = useState<{ text: string; type: "info" | "ok" | "error" } | null>(null);

  // Proxy page state
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyIP, setProxyIP] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [proxyUser, setProxyUser] = useState("");
  const [proxyPass, setProxyPass] = useState("");
  const [useForOtp, setUseForOtp] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<{ text: string; type: "info" | "ok" | "error" } | null>(null);
  const [proxySaved, setProxySaved] = useState<{ enabled: boolean; use_for_otp: boolean }>({
    enabled: false,
    use_for_otp: false
  });

  // Copied button tracking
  const [copiedKeys, setCopiedKeys] = useState<Record<string, boolean>>({});

  const copyVal = (text: string, key: string) => {
    if (!text) return;
    const doCopy = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {}
      document.body.removeChild(ta);
      return Promise.resolve();
    };

    doCopy().then(() => {
      setCopiedKeys((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedKeys((prev) => ({ ...prev, [key]: false }));
      }, 1200);
    });
  };

  const countryFlag = (code: string) => {
    if (!code || code.length !== 2) return "🌐";
    try {
      return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
    } catch (e) {
      return "🌐";
    }
  };

  // Refresh IP
  const refreshIP = async (useProxy = proxySaved.enabled) => {
    if (useProxy) {
      try {
        const res = await fetch("/api/ip_info?use_proxy=1");
        const d = await res.json();
        if (d.success && d.ip && d.ip !== "Unknown") {
          setIpInfo({
            text: `${d.ip} • ${d.country || ""}`,
            flag: countryFlag(d.country_code),
            countryCode: (d.country_code || "").toLowerCase(),
            isProxy: true
          });
          return;
        } else {
          setIpInfo({
            text: "Proxy Error",
            flag: "⚠️",
            countryCode: "",
            isProxy: true
          });
          return;
        }
      } catch (e) {
        setIpInfo({
          text: "Proxy Error",
          flag: "⚠️",
          countryCode: "",
          isProxy: true
        });
        return;
      }
    }

    // Direct Client Device IP (from browser directly)
    try {
      const res = await fetch("https://ipwho.is/");
      const d = await res.json();
      if (d && d.success && d.ip) {
        setIpInfo({
          text: `${d.ip} • ${d.country || ""}`,
          flag: countryFlag(d.country_code),
          countryCode: (d.country_code || "").toLowerCase(),
          isProxy: false
        });
        return;
      }
    } catch (e) {}

    try {
      const res2 = await fetch("https://ipapi.co/json/");
      const d2 = await res2.json();
      if (d2 && d2.ip) {
        setIpInfo({
          text: `${d2.ip} • ${d2.country_name || d2.country || ""}`,
          flag: countryFlag(d2.country_code),
          countryCode: (d2.country_code || "").toLowerCase(),
          isProxy: false
        });
        return;
      }
    } catch (e) {}

    try {
      const res3 = await fetch("https://api.ipify.org?format=json");
      const d3 = await res3.json();
      if (d3 && d3.ip) {
        setIpInfo({
          text: `${d3.ip}`,
          flag: "🌐",
          countryCode: "",
          isProxy: false
        });
        return;
      }
    } catch (e) {}

    setIpInfo({
      text: "Online",
      flag: "🌐",
      countryCode: "",
      isProxy: false
    });
  };

  // Load Activation Status
  const loadActivationStatus = (keyStr = loginKey) => {
    if (!keyStr) return;
    fetch(`/api/activation_status?key=${encodeURIComponent(keyStr)}`)
      .then((r) => r.json())
      .then((d) => {
        setActStatus(d);
        if (d && d.active && d.expire_ts) {
          startCountdown(d.expire_ts);
        } else {
          if (timerRef.current) clearInterval(timerRef.current);
        }
      })
      .catch(() => {});
  };

  // Countdown function
  const startCountdown = (expTs: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const rem = Math.floor(expTs - now);
      if (rem <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setCountdown({ d: 0, h: 0, m: 0, s: 0 });
        loadActivationStatus();
        return;
      }
      const d = Math.floor(rem / 86400);
      const h = Math.floor((rem % 86400) / 3600);
      const m = Math.floor((rem % 3600) / 60);
      const s = Math.floor(rem % 60);
      setCountdown({ d, h, m, s });
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  };

  // Load My Activation Keys
  const loadMyActivationKeys = (keyStr = loginKey) => {
    if (!keyStr) return;
    fetch(`/api/my_keys?key=${encodeURIComponent(keyStr)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.keys)) {
          setMyKeys(d.keys);
        } else {
          setMyKeys([]);
        }
      })
      .catch(() => {});
  };

  // Load Providers
  const loadProviders = () => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => {
        if (d.providers) {
          setAvailableProviders(d.providers);
          const saved = localStorage.getItem("meta_provider") || "temptf";
          setSelectedProvider(saved);
          const found = d.providers.find((p: ProviderItem) => p.id === saved) || d.providers[0];
          if (found) setCurrentProvider(found);
          fetch("/api/set_provider", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: found.id })
          });
        }
      })
      .catch(() => {});
  };

  // Load Proxy Config
  const loadProxyCfg = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("meta_proxy_cfg") || "null");
      if (saved && saved.enabled && saved.ip) {
        setProxyEnabled(true);
        setProxyIP(saved.ip);
        setProxyPort(saved.port);
        setProxyUser(saved.username || "");
        setProxyPass(saved.password || "");
        setUseForOtp(Boolean(saved.use_for_otp));
        setProxySaved({ enabled: true, use_for_otp: Boolean(saved.use_for_otp) });
        fetch("/api/set_proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saved)
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.country_code) {
              setIpInfo({
                text: `${d.ip || saved.ip} • ${d.country || ""}`,
                flag: countryFlag(d.country_code),
                countryCode: d.country_code.toLowerCase(),
                isProxy: true
              });
            }
          })
          .catch(() => {});
      }
    } catch (e) {}
  };

  // Login handler
  const doLogin = () => {
    const key = loginKeyInput.trim().toUpperCase();
    if (!key) {
      setLoginStatus({ text: "✗ Enter key", type: "error" });
      return;
    }
    setLoginLoading(true);
    setLoginStatus({ text: "⏳ Checking...", type: "info" });

    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    })
      .then((r) => r.json())
      .then((d) => {
        setLoginLoading(false);
        if (!d.success) {
          setLoginStatus({ text: "✗ " + (d.message || "Invalid key"), type: "error" });
          return;
        }
        setLoginKey(key);
        setUserInfo(d.info || {});
        try {
          localStorage.setItem("arafat_key", key);
        } catch (e) {}
        setIsLoggedIn(true);
        refreshIP();
        loadProviders();
        loadProxyCfg();
        loadActivationStatus(key);
        loadMyActivationKeys(key);
      })
      .catch((e) => {
        setLoginLoading(false);
        setLoginStatus({ text: "✗ " + e.message, type: "error" });
      });
  };

  // Auto Login check
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem("arafat_key");
      if (savedKey) {
        setLoginKeyInput(savedKey);
        fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: savedKey })
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.success) {
              setLoginKey(savedKey);
              setUserInfo(d.info || {});
              setIsLoggedIn(true);
              refreshIP();
              loadProviders();
              loadProxyCfg();
              loadActivationStatus(savedKey);
              loadMyActivationKeys(savedKey);
            } else {
              localStorage.removeItem("arafat_key");
            }
          })
          .catch(() => {});
      }
    } catch (e) {}
  }, []);

  const logout = () => {
    try {
      localStorage.removeItem("arafat_key");
    } catch (e) {}
    if (timerRef.current) clearInterval(timerRef.current);
    setIsLoggedIn(false);
    setLoginKey("");
    setUserInfo({});
  };

  const navigate = (page: "dashboard" | "activation" | "meta" | "proxy") => {
    setActivePage(page);
    setSidebarOpen(false);
    if (page === "proxy") refreshIP();
    if (page === "activation") loadMyActivationKeys();
    if (page === "meta") loadActivationStatus();
  };

  const setActivationKey = () => {
    const ak = actKeyInput.trim().toUpperCase();
    if (!ak) {
      setActSetStatus({ text: "✗ Enter key", type: "error" });
      return;
    }
    setActSetStatus({ text: "⏳ Verifying...", type: "info" });
    fetch("/api/set_activation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_key: loginKey, activation_key: ak })
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setActSetStatus({ text: "✓ " + d.message, type: "ok" });
          loadActivationStatus();
          loadMyActivationKeys();
        } else {
          setActSetStatus({ text: "✗ " + (d.message || "Failed"), type: "error" });
        }
      })
      .catch((e) => {
        setActSetStatus({ text: "✗ " + e.message, type: "error" });
      });
  };

  const saveProvider = () => {
    const p = availableProviders.find((x) => x.id === selectedProvider);
    if (!p) return;
    setCurrentProvider(p);
    try {
      localStorage.setItem("meta_provider", selectedProvider);
    } catch (e) {}
    fetch("/api/set_provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: selectedProvider })
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setProviderStatus({ text: "✓ " + p.name, type: "ok" });
          setTimeout(() => setProviderModalOpen(false), 700);
        } else {
          setProviderStatus({ text: "✗ " + d.message, type: "error" });
        }
      });
  };

  const saveProxy = () => {
    const ip = proxyIP.trim();
    const port = proxyPort.trim();
    if (!ip || !port) {
      setProxyStatus({ text: "✗ IP + Port required", type: "error" });
      return;
    }
    setProxyStatus({ text: "⏳ Testing...", type: "info" });
    fetch("/api/set_proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        ip,
        port,
        username: proxyUser.trim(),
        password: proxyPass.trim(),
        use_for_otp: useForOtp
      })
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setProxySaved({ enabled: true, use_for_otp: useForOtp });
          try {
            localStorage.setItem(
              "meta_proxy_cfg",
              JSON.stringify({
                enabled: true,
                ip,
                port,
                username: proxyUser.trim(),
                password: proxyPass.trim(),
                use_for_otp: useForOtp
              })
            );
          } catch (e) {}
          if (d.country_code) {
            setIpInfo({
              text: `${d.ip || ip} • ${d.country || ""}`,
              flag: countryFlag(d.country_code),
              countryCode: d.country_code.toLowerCase(),
              isProxy: true
            });
          }
          setProxyStatus({ text: "✓ " + d.message, type: "ok" });
        } else {
          setProxyStatus({ text: "✗ " + d.message, type: "error" });
        }
      });
  };

  const clearProxy = () => {
    fetch("/api/set_proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false })
    })
      .then((r) => r.json())
      .then(() => {
        setProxySaved({ enabled: false, use_for_otp: false });
        try {
          localStorage.removeItem("meta_proxy_cfg");
        } catch (e) {}
        setProxyEnabled(false);
        setProxyStatus({ text: "✓ Cleared", type: "ok" });
        refreshIP(false);
      });
  };

  const startAuto = () => {
    const pw = autoPassword.trim();
    if (!pw || pw.length < 6) {
      setCreateStatus({ text: "✗ Password min 6 chars", type: "error" });
      return;
    }
    setBulkLoading(true);
    setBulkAccounts(
      Array.from({ length: bulkCount }, (_, i) => ({
        index: i + 1,
        status: "pending",
        email: "",
        password: pw,
        uid: ""
      }))
    );
    setCollectedEmails([]);
    setCreateStatus({ text: `⏳ Processing via ${currentProvider.name}...`, type: "info" });

    fetch("/api/bulk_create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: pw,
        count: bulkCount,
        provider: selectedProvider
      })
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          setBulkLoading(false);
          setCreateStatus({ text: "✗ " + (d.message || d.error), type: "error" });
          return;
        }
        pollBulkStatus(d.batch_id, pw);
      });
  };

  const pollBulkStatus = (batchId: string, pw: string) => {
    const t = setInterval(() => {
      fetch(`/api/bulk_status?batch=${batchId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.accounts) {
            setBulkAccounts(d.accounts);
            const emails = d.accounts
              .filter((a: any) => a.status === "success" && a.email)
              .map((a: any) => a.email);
            setCollectedEmails(emails);
          }
          if (d.done) {
            clearInterval(t);
            setBulkLoading(false);
            const ok = (d.accounts || []).filter((a: any) => a.status === "success").length;
            const fail = (d.accounts || []).length - ok;
            setCreateStatus({ text: `✓ Done! OK: ${ok} | Failed: ${fail}`, type: "ok" });
          }
        })
        .catch(() => {});
    }, 2000);
  };

  const copyAllEmails = () => {
    const successEmails = bulkAccounts
      .filter((a) => a.status === "success" && a.email)
      .map((a) => a.email);

    if (successEmails.length === 0) {
      alert("No successfully created emails to copy yet!");
      return;
    }
    const text = successEmails.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {}
      document.body.removeChild(ta);
    }
    setCopyAllCopied(true);
    setCopyAllBtnText(`✓ COPIED ${successEmails.length} CREATED EMAILS!`);
    setTimeout(() => {
      setCopyAllCopied(false);
      setCopyAllBtnText("📋 COPY ALL CREATED EMAILS");
    }, 2000);
  };

  const startManual = () => {
    const email = manualEmail.trim();
    const pw = manualPassword.trim();
    if (!email || !email.includes("@")) {
      setCreateStatus({ text: "✗ Invalid email", type: "error" });
      return;
    }
    if (!pw || pw.length < 6) {
      setCreateStatus({ text: "✗ Password min 6 chars", type: "error" });
      return;
    }
    setBulkLoading(true);
    setBulkAccounts([]);
    setCreateStatus({ text: "⏳ Creating Meta Account...", type: "info" });

    fetch("/api/manual_create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw })
    })
      .then((r) => r.json())
      .then((d) => {
        setBulkLoading(false);
        if (!d.success) {
          setCreateStatus({ text: "✗ " + (d.message || d.error), type: "error" });
          return;
        }
        setManualSession(d.session);
        setBulkAccounts([{ index: 1, status: "success", email: d.email, password: d.password, uid: d.uid }]);
        setCreateStatus({ text: "✓ Created! Enter OTP", type: "ok" });
      });
  };

  const confirmManualOtp = () => {
    const otp = manualOtp.trim();
    if (!otp || otp.length < 4) {
      setManualOtpStatus({ text: "✗ Invalid OTP", type: "error" });
      return;
    }
    setManualConfirming(true);
    fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: manualSession, otp })
    })
      .then((r) => r.json())
      .then((d) => {
        setManualConfirming(false);
        if (d.confirmed) {
          setManualOtpStatus({ text: `✓✓ CONFIRMED! UID: ${d.uid}`, type: "ok" });
        } else {
          setManualOtpStatus({ text: "✗ " + (d.raw || d.message || "Failed"), type: "error" });
        }
      })
      .catch((e) => {
        setManualConfirming(false);
        setManualOtpStatus({ text: "✗ " + e.message, type: "error" });
      });
  };

  // Telegram Profile Picture handling
  const [topImgError, setTopImgError] = useState(false);
  const [profImgError, setProfImgError] = useState(false);
  const [botAvatar, setBotAvatar] = useState("https://t.me/i/userpic/320/Meta_Power_BOT.jpg");
  const [botImgError, setBotImgError] = useState(false);

  useEffect(() => {
    fetch("/api/bot_avatar")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.photo_url) {
          setBotAvatar(d.photo_url);
        }
      })
      .catch(() => {});
  }, []);

  // Derive photo url
  const cleanUsername = (userInfo.username || "").replace(/^@/, "").trim();
  const photoUrl =
    userInfo.photo_url ||
    userInfo.photo ||
    userInfo.avatar ||
    userInfo.profile_pic ||
    (cleanUsername ? `https://t.me/i/userpic/320/${cleanUsername}.jpg` : "");

  // Dashboard Icon Component
  const DashboardIcon = ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <rect x="3" y="3" width="8" height="8" rx="2" fill="#5B78FF" />
      <rect x="13" y="3" width="8" height="5" rx="2" fill="#7AA3FF" />
      <rect x="13" y="10" width="8" height="11" rx="2" fill="#5B78FF" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill="#7AA3FF" />
    </svg>
  );

  // Key / Activation Icon Component
  const KeyIcon = ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <path
        d="M7 14C9.20914 14 11 12.2091 11 10C11 7.79086 9.20914 6 7 6C4.79086 6 3 7.79086 3 10C3 12.2091 4.79086 14 7 14Z"
        stroke="#FFB800"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#FFB800"
        fillOpacity="0.25"
      />
      <path
        d="M9.8 12.8L19 22L22 19L19 16L16 19L12.8 15.8"
        stroke="#FFB800"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="10" r="1.5" fill="#FFB800" />
    </svg>
  );

  // Proxy Icon Component
  const ProxyIcon = ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <circle cx="12" cy="12" r="9" stroke="#38D996" strokeWidth="2" />
      <path d="M3.6 9H20.4M3.6 15H20.4" stroke="#38D996" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="12" cy="12" rx="4" ry="9" stroke="#38D996" strokeWidth="2" />
    </svg>
  );

  // Meta Bot Logo Component
  const MetaBotIcon = ({ size = 20 }: { size?: number }) => (
    <img
      src={botAvatar}
      alt="Meta"
      onError={() => setBotImgError(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        display: "inline-block",
        verticalAlign: "middle"
      }}
    />
  );

  useEffect(() => {
    setTopImgError(false);
    setProfImgError(false);
  }, [photoUrl]);

  // -------------------------------------------------------------------
  // 1. LOGIN SCREEN
  // -------------------------------------------------------------------
  if (!isLoggedIn) {
    return (
      <div id="loginScreen">
        <div style={{ maxWidth: 440, margin: "60px auto", padding: 22 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div
              style={{
                width: 70,
                height: 70,
                margin: "0 auto 14px",
                borderRadius: 20,
                background: "linear-gradient(135deg,#5b78ff,#a86bff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                boxShadow: "0 8px 32px rgba(91,120,255,.45)",
                overflow: "hidden"
              }}
            >
              {botAvatar && !botImgError ? (
                <img
                  src={botAvatar}
                  alt="Meta Power Bot"
                  onError={() => setBotImgError(true)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                "⚡"
              )}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                background: "linear-gradient(90deg,#5b78ff,#a86bff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent"
              }}
            >
              Meta Manager
            </div>
            <div style={{ fontSize: 11, color: "#8996b0", marginTop: 4 }}>Login with your bot key</div>
          </div>
          <div className="card">
            <h2>🔑 Login</h2>
            <label>Login Key (from Telegram Bot)</label>
            <input
              id="loginKey"
              value={loginKeyInput}
              onChange={(e) => setLoginKeyInput(e.target.value.toUpperCase())}
              placeholder="KEY-XXXXXXXX"
              autoComplete="off"
              autoCapitalize="characters"
            />
            <button onClick={doLogin} id="btnLogin" disabled={loginLoading}>
              {loginLoading ? (
                <>
                  <span className="spinner"></span>Logging in...
                </>
              ) : (
                "🔓 LOGIN"
              )}
            </button>
            {loginStatus && <div className={`status ${loginStatus.type}`}>{loginStatus.text}</div>}
            <div style={{ fontSize: 10, color: "#66738d", marginTop: 12, textAlign: "center", lineHeight: 1.7 }}>
              Get your key from Telegram bot:
              <br />
              <a href="https://t.me/Meta_Power_BOT" target="_blank" style={{ color: "#229ED9", fontWeight: 700 }} rel="noreferrer">
                @Meta_Power_BOT
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // 2. MAIN APP
  // -------------------------------------------------------------------
  const userName = userInfo.name || "User";
  const userHandle = userInfo.username || "@user";
  const userBal = userInfo.balance !== undefined ? userInfo.balance : 0;
  const userRefer = userInfo.refer !== undefined ? userInfo.refer : 0;
  const avatarLetter = userName.charAt(0).toUpperCase() || "U";

  return (
    <div id="mainApp">
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-left">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
            ☰
          </button>
          <div className="brand">
            <div className="brand-title">⚡ Meta Manager</div>
            <div className="brand-sub">Premium Panel</div>
          </div>
        </div>
        <div className="user-box">
          <div className="user-meta">
            <div className="user-name" id="topName">
              {userName}
            </div>
            <div className="user-handle" id="topUser">
              {userHandle}
            </div>
          </div>
          <div className="avatar" id="topAvatar" style={{ overflow: "hidden" }}>
            {photoUrl && !topImgError ? (
              <img
                src={photoUrl}
                alt={userName}
                onError={() => setTopImgError(true)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              avatarLetter
            )}
          </div>
        </div>
      </div>

      {/* Sidebar & Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        id="sidebarOverlay"
        onClick={() => setSidebarOpen(false)}
      ></div>

      <div className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
        <div className="side-head">
          <div className="side-title">⚡ MENU</div>
          <button className="side-close" onClick={() => setSidebarOpen(false)}>
            ✕
          </button>
        </div>
        <div className="side-menu">
          <div
            className={`side-item ${activePage === "dashboard" ? "active" : ""}`}
            id="navDashboard"
            onClick={() => navigate("dashboard")}
          >
            <div className="icon">
              <DashboardIcon size={22} />
            </div>
            <div className="label">
              Dashboard<div className="sub">Overview</div>
            </div>
          </div>
          <div
            className={`side-item ${activePage === "activation" ? "active" : ""}`}
            id="navActivation"
            onClick={() => navigate("activation")}
          >
            <div className="icon">
              <KeyIcon size={22} />
            </div>
            <div className="label">
              Activation Key<div className="sub">Activate features</div>
            </div>
          </div>
          <div
            className={`side-item ${activePage === "meta" ? "active" : ""}`}
            id="navMeta"
            onClick={() => navigate("meta")}
          >
            <div className="icon">
              <MetaBotIcon size={22} />
            </div>
            <div className="label">
              Meta<div className="sub">Email + OTP</div>
            </div>
          </div>
          <div
            className={`side-item ${activePage === "proxy" ? "active" : ""}`}
            id="navProxy"
            onClick={() => navigate("proxy")}
          >
            <div className="icon">
              <ProxyIcon size={22} />
            </div>
            <div className="label">
              Proxy<div className="sub">IP / Port</div>
            </div>
          </div>
        </div>
        <div className="side-footer">
          Meta Manager
          <br />
          <a href="https://t.me/Meta_Power_BOT" target="_blank" rel="noreferrer">
            @Meta_Power_BOT
          </a>
          <div style={{ marginTop: 10 }}>
            <button
              onClick={logout}
              style={{ background: "#7d263b", fontSize: 11, padding: 8, margin: 0 }}
            >
              🚪 Logout
            </button>
          </div>
        </div>
      </div>

      {/* Floating IP Chip */}
      <div
        className={`ip-chip ${ipInfo.isProxy ? "proxy" : ""}`}
        id="ipChip"
        onClick={() => refreshIP()}
      >
        {ipInfo.countryCode ? (
          <img
            src={`https://flagcdn.com/32x24/${ipInfo.countryCode.toLowerCase()}.png`}
            alt={ipInfo.countryCode}
            style={{
              width: 18,
              height: 13,
              borderRadius: 2,
              display: "inline-block",
              objectFit: "cover",
              verticalAlign: "middle",
              flexShrink: 0
            }}
            onError={(e) => {
              (e.currentTarget.style.display = "none");
            }}
          />
        ) : (
          <span id="ipFlag">{ipInfo.flag}</span>
        )}
        <span id="ipText">{ipInfo.text}</span>
      </div>

      {/* Main Wrap */}
      <div className="main-wrap">
        {/* =================== PAGE 1: DASHBOARD =================== */}
        {activePage === "dashboard" && (
          <div id="pageDashboard">
            {/* User Profile Card */}
            <div className="profile-card">
              <div className="profile-top">
                <div className="profile-avatar" id="profAvatar" style={{ overflow: "hidden" }}>
                  {photoUrl && !profImgError ? (
                    <img
                      src={photoUrl}
                      alt={userName}
                      onError={() => setProfImgError(true)}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    avatarLetter
                  )}
                </div>
                <div className="profile-info">
                  <div className="profile-name" id="profName">
                    {userName}
                  </div>
                  <div className="profile-user" id="profUser">
                    {userHandle}
                  </div>
                  <div className="profile-badge" id="profBadge">
                    ● ONLINE
                  </div>
                </div>
              </div>
              <div className="balance-box">
                <div className="balance-item">
                  <div className="b-label">Balance</div>
                  <div className="b-value" id="profBalance">
                    {userBal}৳
                  </div>
                </div>
                <div className="balance-item">
                  <div className="b-label">Total Refer</div>
                  <div className="b-value blue" id="profRefer">
                    {userRefer}
                  </div>
                </div>
              </div>
            </div>

            {/* Activation Status Card */}
            <div id="actStatusCard">
              {!actStatus || !actStatus.active ? (
                <div className="act-box inactive">
                  <div className="act-title">❌ NO ACTIVE KEY</div>
                  <div style={{ fontSize: 12, color: "#c9a0a8", lineHeight: 1.6 }}>
                    Tools unlock করতে Activation Key কিনুন এবং set করুন।
                    <br />
                    <a href="https://t.me/Smart_Earning_Z" style={{ color: "#7aa3ff" }} target="_blank" rel="noreferrer">
                      Telegram Bot এ যান
                    </a>{" "}
                    → Buy Package → 3 Day 30৳
                  </div>
                  <button
                    onClick={() => navigate("activation")}
                    style={{ background: "linear-gradient(90deg,#229ED9,#1c8cc2)", marginTop: 12 }}
                  >
                    🎫 SET ACTIVATION KEY
                  </button>
                </div>
              ) : (
                <div className="act-box">
                  <div className="act-title">✅ ACTIVE — {actStatus.package || "3 Day"}</div>
                  <div style={{ fontSize: 11, color: "#8fd0b0" }}>Time remaining:</div>
                  <div className="countdown-grid">
                    <div className="cd-item">
                      <div className="cd-val" id="cdD">
                        {countdown.d}
                      </div>
                      <div className="cd-lbl">Days</div>
                    </div>
                    <div className="cd-item">
                      <div className="cd-val" id="cdH">
                        {countdown.h}
                      </div>
                      <div className="cd-lbl">Hours</div>
                    </div>
                    <div className="cd-item">
                      <div className="cd-val" id="cdM">
                        {countdown.m}
                      </div>
                      <div className="cd-lbl">Minutes</div>
                    </div>
                    <div className="cd-item">
                      <div className="cd-val" id="cdS">
                        {countdown.s}
                      </div>
                      <div className="cd-lbl">Seconds</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================== PAGE 2: ACTIVATION =================== */}
        {activePage === "activation" && (
          <div id="pageActivation">
            <div className="page-head">
              <div className="ph-icon">
                <KeyIcon size={34} />
              </div>
              <div>
                <h1>Activation Key</h1>
                <p>Set your activation key to unlock features</p>
              </div>
            </div>
            <div className="card">
              <h2>
                <KeyIcon size={18} /> Set Activation Key
              </h2>
              <label>Activation Key</label>
              <input
                id="actKeyInput"
                value={actKeyInput}
                onChange={(e) => setActKeyInput(e.target.value.toUpperCase())}
                placeholder="ACT-XXXXXXXXXX"
                autoComplete="off"
                autoCapitalize="characters"
              />
              <button onClick={setActivationKey} id="btnSetAct">
                ✓ SET ACTIVATION KEY
              </button>
              {actSetStatus && <div className={`status ${actSetStatus.type}`}>{actSetStatus.text}</div>}
            </div>

            <div className="card">
              <h2>📋 My Activation Keys</h2>
              <div id="myActKeys" style={{ fontSize: 12, color: "#9fb0d0", lineHeight: 1.8 }}>
                {myKeys.length === 0 ? (
                  <div style={{ color: "#66738d" }}>No activation keys yet.</div>
                ) : (
                  myKeys.map((k, idx) => {
                    const color = k.active ? "#38d996" : "#ff5f78";
                    const icon = k.active ? "✅" : "❌";
                    const txt = k.active ? `Active (${k.remaining_text})` : "Expired";
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: 10,
                          border: "1px solid #263450",
                          borderRadius: 10,
                          background: "#0a1120",
                          marginBottom: 8
                        }}
                      >
                        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#7aa3ff" }}>{k.key}</div>
                        <div style={{ fontSize: 10, color: "#66738d", marginTop: 4 }}>
                          Package: {k.package || "-"}
                        </div>
                        <div style={{ fontSize: 11, color, marginTop: 4, fontWeight: 700 }}>
                          {icon} {txt}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* =================== PAGE 3: META =================== */}
        {activePage === "meta" && (
          <div id="pageMeta">
            {!actStatus || !actStatus.active ? (
              <div className="gate">
                <h2>🔒 Locked</h2>
                <p>
                  এই section ব্যবহার করতে একটি <b>Activation Key</b> সেট করুন।
                  <br />
                  Bot থেকে 3 Day Package (30৳) কিনুন।
                </p>
                <button onClick={() => navigate("activation")}>🎫 Set Activation Key</button>
              </div>
            ) : (
              <div id="metaContent">
                <div className="page-head">
                  <div className="ph-icon">
                    <MetaBotIcon size={34} />
                  </div>
                  <div>
                    <h1>Meta Creator</h1>
                    <p>Temp Mail / Custom Email</p>
                  </div>
                </div>
                <div className="card">
                  <h2>
                    <MetaBotIcon size={18} /> Create Meta Account
                  </h2>
                  <div className="tabs">
                    <div
                      className={`tab ${metaTab === "auto" ? "active" : ""}`}
                      id="tabAuto"
                      onClick={() => setMetaTab("auto")}
                    >
                      📧 Temp Mail
                    </div>
                    <div
                      className={`tab ${metaTab === "manual" ? "active" : ""}`}
                      id="tabManual"
                      onClick={() => setMetaTab("manual")}
                    >
                      ✉ Custom Email
                    </div>
                  </div>

                  {/* Auto Panel */}
                  {metaTab === "auto" && (
                    <div id="autoPanel">
                      <label>Temp Mail Provider</label>
                      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                        <div
                          style={{
                            flex: 1,
                            padding: "11px 13px",
                            borderRadius: 9,
                            border: "1px solid #263450",
                            background: "#0a1120",
                            display: "flex",
                            alignItems: "center",
                            gap: 8
                          }}
                        >
                          <span id="currentProviderBadge" style={{ fontSize: 16 }}>
                            {currentProvider.badge}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div id="currentProviderName" style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
                              {currentProvider.name}
                            </div>
                            <div id="currentProviderDesc" style={{ fontSize: 9, color: "#66738d" }}>
                              {currentProvider.desc}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setProviderModalOpen(true)}
                          style={{ width: "auto", padding: "0 16px", margin: 0, fontSize: 12 }}
                        >
                          CHANGE
                        </button>
                      </div>

                      <label>Password (min 6 chars)</label>
                      <input
                        id="autoPassword"
                        value={autoPassword}
                        onChange={(e) => setAutoPassword(e.target.value)}
                        placeholder="Enter password"
                      />

                      <label>How many? (Max 5)</label>
                      <div className="count-row">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <div
                            key={num}
                            className={`count-btn ${bulkCount === num ? "active" : ""}`}
                            onClick={() => setBulkCount(num)}
                          >
                            {num}
                          </div>
                        ))}
                      </div>

                      <button onClick={startAuto} id="btnAuto" disabled={bulkLoading}>
                        {bulkLoading ? (
                          <>
                            <span className="spinner"></span>Creating...
                          </>
                        ) : (
                          "⚡ CREATE META ACCOUNTS"
                        )}
                      </button>

                      {collectedEmails.length > 0 && (
                        <button
                          onClick={copyAllEmails}
                          id="btnCopyAll"
                          className={`btn-copy-all ${copyAllCopied ? "btn-green" : ""}`}
                        >
                          {copyAllBtnText}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Manual Panel */}
                  {metaTab === "manual" && (
                    <div id="manualPanel">
                      <label>Custom Email</label>
                      <input
                        id="manualEmail"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                      <label>Password</label>
                      <input
                        id="manualPassword"
                        value={manualPassword}
                        onChange={(e) => setManualPassword(e.target.value)}
                        placeholder="Enter password"
                      />
                      <button onClick={startManual} id="btnManual" disabled={bulkLoading}>
                        {bulkLoading ? (
                          <>
                            <span className="spinner"></span>Creating...
                          </>
                        ) : (
                          "⚡ CREATE META ACCOUNT"
                        )}
                      </button>
                    </div>
                  )}

                  {createStatus && <div className={`status ${createStatus.type}`}>{createStatus.text}</div>}

                  {/* Accounts List */}
                  <div className="accounts-list" id="accountsList">
                    {bulkAccounts.map((acc, idx) => (
                      <div className={`account-row ${acc.status}`} key={idx} id={`row_${acc.index}`}>
                        <div className="row-header">
                          <span>#{acc.index}</span>
                          <span className={`row-status ${acc.status}`} id={`status_${acc.index}`}>
                            {acc.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="row-field">
                          <span className="label">Email</span>
                          <span className="value" id={`email_${acc.index}`}>
                            {acc.email || "—"}
                          </span>
                          {acc.email && (
                            <button
                              className={`copy-btn ${copiedKeys[`bulk_email_${acc.index}`] ? "copied" : ""}`}
                              onClick={() => copyVal(acc.email, `bulk_email_${acc.index}`)}
                            >
                              {copiedKeys[`bulk_email_${acc.index}`] ? "✓" : "COPY"}
                            </button>
                          )}
                        </div>
                        <div className="row-field">
                          <span className="label">Password</span>
                          <span className="value" id={`pass_${acc.index}`}>
                            {acc.password || autoPassword || "—"}
                          </span>
                          {(acc.password || autoPassword) && (
                            <button
                              className={`copy-btn ${copiedKeys[`bulk_pass_${acc.index}`] ? "copied" : ""}`}
                              onClick={() => copyVal(acc.password || autoPassword, `bulk_pass_${acc.index}`)}
                            >
                              {copiedKeys[`bulk_pass_${acc.index}`] ? "✓" : "COPY"}
                            </button>
                          )}
                        </div>

                        {acc.status === "success" && acc.uid && (
                          <div
                            style={{
                              background: "#0f2e22",
                              border: "1px solid #1c9c66",
                              borderRadius: 10,
                              padding: 10,
                              marginTop: 8
                            }}
                          >
                            <div className="row-field">
                              <span className="label" style={{ color: "#38d996" }}>
                                ✓ UID
                              </span>
                              <span className="value highlight">{acc.uid}</span>
                              <button
                                className={`copy-btn ${copiedKeys[`bulk_uid_${acc.index}`] ? "copied" : ""}`}
                                onClick={() => copyVal(acc.uid, `bulk_uid_${acc.index}`)}
                              >
                                {copiedKeys[`bulk_uid_${acc.index}`] ? "✓" : "COPY"}
                              </button>
                            </div>
                          </div>
                        )}

                        {metaTab === "manual" && manualSession && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: 12,
                              borderRadius: 10,
                              background: "#0a1120",
                              border: "1px solid #263450"
                            }}
                          >
                            <input
                              id="otp_1"
                              value={manualOtp}
                              onChange={(e) => setManualOtp(e.target.value)}
                              placeholder="Enter OTP"
                              maxLength={6}
                              style={{
                                textAlign: "center",
                                fontSize: 18,
                                letterSpacing: 4,
                                fontWeight: 700,
                                fontFamily: "monospace"
                              }}
                            />
                            <button
                              onClick={confirmManualOtp}
                              id="btnconfirm_1"
                              disabled={manualConfirming}
                              style={{ marginTop: 8 }}
                            >
                              {manualConfirming ? (
                                <>
                                  <span className="spinner"></span>Confirming...
                                </>
                              ) : (
                                "✓ CONFIRM OTP"
                              )}
                            </button>
                            {manualOtpStatus && (
                              <div className={`status ${manualOtpStatus.type}`}>{manualOtpStatus.text}</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================== PAGE 5: PROXY =================== */}
        {activePage === "proxy" && (
          <div id="pageProxy">
            <div className="page-head">
              <div className="ph-icon">🌐</div>
              <div>
                <h1>Proxy Settings</h1>
                <p>Configure HTTP proxy</p>
              </div>
            </div>
            <div className="card">
              <h2>🌐 Proxy Configuration</h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 12,
                  borderRadius: 10,
                  background: "#0a1120",
                  border: "1px solid #263450",
                  marginBottom: 12
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Enable Proxy</div>
                  <div style={{ fontSize: 10, color: "#66738d" }}>Create + OTP এ use হবে</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    id="proxyEnabled"
                    checked={proxyEnabled}
                    onChange={(e) => setProxyEnabled(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              {proxyEnabled && (
                <div id="proxyFields">
                  <label>Proxy IP / Host</label>
                  <input
                    id="proxyIP"
                    value={proxyIP}
                    onChange={(e) => setProxyIP(e.target.value)}
                    placeholder="123.45.67.89"
                  />
                  <label>Port</label>
                  <input
                    id="proxyPort"
                    value={proxyPort}
                    onChange={(e) => setProxyPort(e.target.value)}
                    placeholder="8080"
                    type="number"
                  />
                  <div className="row-2">
                    <div>
                      <label>Username</label>
                      <input
                        id="proxyUser"
                        value={proxyUser}
                        onChange={(e) => setProxyUser(e.target.value)}
                        placeholder="optional"
                      />
                    </div>
                    <div>
                      <label>Password</label>
                      <input
                        id="proxyPass"
                        value={proxyPass}
                        onChange={(e) => setProxyPass(e.target.value)}
                        placeholder="optional"
                        type="password"
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: 12,
                      borderRadius: 10,
                      background: "#0a1120",
                      border: "1px solid #263450",
                      marginTop: 14
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>OTP Confirm এ Proxy</div>
                      <div style={{ fontSize: 10, color: "#66738d" }} id="otpModeDesc">
                        {useForOtp ? "ON → Proxy IP" : "OFF → Real IP"}
                      </div>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        id="useForOtp"
                        checked={useForOtp}
                        onChange={(e) => setUseForOtp(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                  <button onClick={saveProxy} className="btn-green">
                    💾 SAVE & TEST
                  </button>
                  <button onClick={clearProxy} className="btn-red">
                    🗑 CLEAR PROXY
                  </button>
                </div>
              )}

              {proxyStatus && <div className={`status ${proxyStatus.type}`}>{proxyStatus.text}</div>}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          © 2026 • Powered by{" "}
          <a href="https://t.me/Smart_Earning_Z" target="_blank" rel="noreferrer">
            Smart Earning
          </a>
        </div>
      </div>

      {/* Provider Modal Overlay */}
      {providerModalOpen && (
        <div className="modal-overlay" id="providerModal">
          <div className="modal-box">
            <button className="modal-close" onClick={() => setProviderModalOpen(false)}>
              ✕
            </button>
            <div className="modal-title">
              <span>📧</span>
              <span>Select Temp Mail</span>
            </div>
            <div className="modal-sub">Choose which temp mail service to use.</div>
            <div className="provider-grid" id="providerGrid">
              {availableProviders.map((p) => (
                <div
                  key={p.id}
                  className={`provider-card ${p.id === selectedProvider ? "active" : ""}`}
                  onClick={() => setSelectedProvider(p.id)}
                >
                  <div className="p-top">
                    <span className="p-badge">{p.badge}</span>
                    <span className="p-name">{p.name}</span>
                  </div>
                  <div className="p-desc">{p.desc}</div>
                </div>
              ))}
            </div>
            {providerStatus && <div className={`status ${providerStatus.type}`}>{providerStatus.text}</div>}
            <button onClick={saveProvider} className="btn-green" style={{ marginTop: 14 }}>
              ✓ APPLY
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
