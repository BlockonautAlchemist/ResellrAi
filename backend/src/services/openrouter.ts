import { env } from '../config/env.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Call OpenRouter API with a text prompt
 * @param prompt - The text prompt
 * @param model - Model to use (defaults to env config)
 * @returns The generated text response
 */
export async function generateText(
  prompt: string,
  systemPrompt?: string,
  model?: string
): Promise<string> {
  const messages: OpenRouterMessage[] = [];
  
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://resellrai.com',
      'X-Title': 'ResellrAI',
    },
    body: JSON.stringify({
      model: model || env.OPENROUTER_TEXT_MODEL,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  return data.choices[0]?.message?.content || '';
}

/**
 * Analyze an image using vision model
 * @param imageUrl - URL of the image to analyze
 * @param prompt - What to analyze about the image
 * @param model - Vision model to use (defaults to env config)
 * @returns The analysis response
 */
export async function analyzeImage(
  imageUrl: string,
  prompt: string,
  systemPrompt?: string,
  model?: string
): Promise<string> {
  const messages: OpenRouterMessage[] = [];
  
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  
  messages.push({
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: imageUrl } },
      { type: 'text', text: prompt },
    ],
  });

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://resellrai.com',
      'X-Title': 'ResellrAI',
    },
    body: JSON.stringify({
      model: model || env.OPENROUTER_VISION_MODEL,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  return data.choices[0]?.message?.content || '';
}

/**
 * Test OpenRouter API connection
 * @returns true if connection is successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    console.log('Testing OpenRouter connection...');
    console.log(`   Text model: ${env.OPENROUTER_TEXT_MODEL}`);
    console.log(`   Vision model: ${env.OPENROUTER_VISION_MODEL}`);
    
    // Simple test with text model
    const response = await generateText(
      'Reply with only the word "connected" and nothing else.',
      'You are a connection test. Reply only with the exact word requested.'
    );
    
    if (response.toLowerCase().includes('connected')) {
      console.log('✅ OpenRouter connection successful');
      return true;
    } else {
      console.log('⚠️  OpenRouter responded but with unexpected content:', response);
      return true; // Still connected, just unexpected response
    }
  } catch (err) {
    console.error('❌ OpenRouter connection test failed:', err);
    return false;
  }
}

/**
 * Test vision model with a sample image
 * @param imageUrl - URL of test image
 * @returns true if vision model works
 */
export async function testVision(imageUrl: string): Promise<boolean> {
  try {
    console.log('Testing OpenRouter vision model...');
    
    const response = await analyzeImage(
      imageUrl,
      'Describe this image in one sentence.',
      'You are an image analyzer. Describe images concisely.'
    );
    
    if (response && response.length > 0) {
      console.log('✅ OpenRouter vision test successful');
      console.log(`   Response: ${response.substring(0, 100)}...`);
      return true;
    } else {
      console.log('⚠️  OpenRouter vision returned empty response');
      return false;
    }
  } catch (err) {
    console.error('❌ OpenRouter vision test failed:', err);
    return false;
  }
}
