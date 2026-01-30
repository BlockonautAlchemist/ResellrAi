import { config } from 'dotenv';
import { z } from 'zod';

// Load .env file
config();

// Environment schema with validation
const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),

  // OpenRouter
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_VISION_MODEL: z.string().default('google/gemini-flash-1.5'),
  OPENROUTER_TEXT_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),

  // eBay Integration
  EBAY_CLIENT_ID: z.string().min(1, 'EBAY_CLIENT_ID is required for eBay integration').optional(),
  EBAY_CLIENT_SECRET: z.string().min(1, 'EBAY_CLIENT_SECRET is required for eBay integration').optional(),
  EBAY_RUNAME: z.string().min(1, 'EBAY_RUNAME is required for eBay OAuth').optional(),
  EBAY_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  EBAY_TOKEN_ENCRYPTION_KEY: z.string().length(64, 'EBAY_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)').optional(),

  // App URLs (for OAuth callbacks)
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  MOBILE_DEEP_LINK_SCHEME: z.string().default('resellrai'),
  // Expo Go dev URL for OAuth redirects (e.g., exp://192.168.1.50:8081)
  // When set, uses Expo Go compatible deep links instead of custom scheme
  EXPO_DEV_URL: z.string().optional(),

  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Parse and validate environment
function loadEnv() {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Environment validation failed:');
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\n📝 Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
  
  return result.data;
}

export const env = loadEnv();

// Type for the validated environment
export type Env = z.infer<typeof envSchema>;
