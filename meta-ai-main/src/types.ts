export interface Service {
  name: string;
  ranges?: string[];
  country?: Record<string, string>;
}

export interface UserNumber {
  number: string;
  service: string;
  range: string;
  country: string;
  time: string;
  otp: string | null;
  otp_time: string | null;
}

export interface SentOtp {
  time: string;
  user: string;
}

export interface YesmsSession {
  session_cookie?: string;
  last_login?: string;
}

export interface BotTokenStat {
  token: string;
  otp_count: number;
  last_otp_time?: string;
}

export interface BroadcastMessage {
  text: string;
  timestamp: string;
  status: "pending" | "sent";
}
