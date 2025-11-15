// src/config/config.ts
import 'dotenv/config';

const toBool = (v: any, def = false) => {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s);
};
const toNum = (v: any, def?: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : (def as number);
};

export default () => ({
  app: {
    auditLog: toBool(process.env.APP_AUDIT_LOG ?? false),
    globalPrefix: process.env.APP_GLOBAL_PREFIX || '/api/v1',
    port: toNum(process.env.PORT ?? process.env.APP_PORT, 4401),
  },

  database: {
    url:
      process.env.MONGO_URI ||
      process.env.DB_URL ||
      'mongodb://127.0.0.1:27017/be?authSource=admin',
    name: process.env.DB_NAME || 'be',
  },

  jwt: {
    secretKey:
      process.env.JWT_SECRET ||
      process.env.JWT_SECRET_KEY ||
      'change_me_please',
    signOptions: {
      expiresIn:
        process.env.JWT_EXPIRES_IN ||
        process.env.JWT_SIGN_OPTIONS_EXPIRES_IN ||
        '2d',
      issuer: process.env.JWT_SIGN_OPTIONS_ISSUER || 'foodmap',
      audience: process.env.JWT_SIGN_OPTIONS_AUDIENCE || "foodmap",
    },
  },

  redis: {
    mode: process.env.REDIS_MODE || 'standalone',
    host: process.env.REDIS_HOST || 'localhost',
    port: toNum(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || '',
    prefix: process.env.REDIS_PREFIX || '',
    db: toNum(process.env.REDIS_DB, 0),
    connectTimeout: toNum(process.env.REDIS_CONNECT_TIMEOUT, 10000),
    clusterNodes: process.env.REDIS_CLUSTER_NODES || '',

    modeBullMq: process.env.REDIS_MODE_BULL_MQ || 'inherit',
    hostBullMq: process.env.REDIS_HOST_BULL_MQ || 'localhost',
    portBullMq: toNum(process.env.REDIS_PORT_BULL_MQ, 6379),
    passwordBullMq: process.env.REDIS_PASSWORD_BULL_MQ || '',
    prefixBullMq: process.env.REDIS_PREFIX_BULL_MQ || '',
    dbBullMq: toNum(process.env.REDIS_DB_BULL_MQ, 0),
    connectTimeoutBullMq: toNum(
      process.env.REDIS_CONNECT_TIMEOUT_BULL_MQ,
      10000,
    ),
    clusterNodesBullMq: process.env.REDIS_CLUSTER_NODES_BULL_MQ || '',
  },

  aws: {
    s3: {
      accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
      bucketName: process.env.AWS_S3_BUCKET_NAME,
    },
    mail: {
      regionMail: process.env.AWS_REGION_MAIL,
      accessKeyIdMail: process.env.AWS_ACCESS_KEY_ID_MAIL,
      secretAccessKeyMail: process.env.AWS_SECRET_ACCESS_KEY_MAIL,
      sesDefaultFromMail: process.env.AWS_SES_DEFAULT_FROM_MAIL,
    },
  },

  mailing: {
    name: process.env.MAILING_NAME || 'FoodMap',
    service: process.env.MAILING_SERVICE || 'smtp',
    auth: process.env.MAILING_AUTH,
    password: process.env.MAILING_PASSWORD,
    smtp: {
      host:
        process.env.MAILING_SMTP_HOST ||
        process.env.SMTP_HOST ||
        'smtp.gmail.com',
      port: toNum(process.env.MAILING_SMTP_PORT || process.env.SMTP_PORT, 587),
      secure: toBool(
        process.env.MAILING_SMTP_SECURE ??
          (String(process.env.MAILING_SMTP_PORT || process.env.SMTP_PORT) ===
          '465'
            ? 'true'
            : 'false'),
        false,
      ),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
    },
  },

  google: {
    geminiApiKey: process.env.GOOGLE_GEMINI_API_KEY,
    ttsApiKey: process.env.GOOGLE_TTS_API_KEY,
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    oauth: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },

  weather: {
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
  },

  vector: {
    chromaUrl: process.env.CHROMA_API_URL,
  },

  secrets: {
    mySecretKey: process.env.MY_SECRET_KEY,
  },

  setting: {},
});
