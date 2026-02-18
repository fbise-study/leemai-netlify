// Netlify Function: /netlify/functions/leemai.js
// This keeps your API key secure on the server

exports.handler = async (event, context) => {
  
  // CORS headers for browser access
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only POST allowed
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request
    const { question, language } = JSON.parse(event.body || '{}');

    // Validate input
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Question is required' })
      };
    }

    // Check for API key in environment
    if (!process.env.AIML_API_KEY) {
      console.error('AIML_API_KEY not set in environment');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          answer: 'Service configuration error. Please contact support.' 
        })
      };
    }

    console.log('Processing question:', question.substring(0, 50) + '...');
    console.log('Language:', language || 'en');

    // Build prompt
    const isUrdu = language === 'ur';
    const systemPrompt = `You are LeemAI, an intelligent study assistant for FBISE (Federal Board) students in Pakistan studying classes 9-12.

Your role:
- Explain concepts clearly and simply
- Provide accurate educational information
- Help with Mathematics, Physics, Chemistry, Biology, English, Urdu, Islamiyat, Pakistan Studies
- Give study tips and exam preparation advice
- Be encouraging and supportive

Important rules:
- ${isUrdu ? 'Answer in clear Urdu (اردو)' : 'Answer in simple, clear English'}
- Keep answers concise (2-4 paragraphs max)
- Do NOT help with cheating or provide direct exam answers
- If you don't know something, say so honestly
- For complex topics, break them down step by step`;

    const userMessage = `${question}`;

    // Call AI/ML API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch('https://api.aimlapi.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIML_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Fast and cost-effective
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 500,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    console.log('AI/ML API response status:', response.status);

    // Handle API errors
    if (!response.ok) {
      const errorData = await response.text();
      console.error('AI/ML API error:', response.status, errorData);

      if (response.status === 401) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            answer: 'Authentication error. Please check API configuration.' 
          })
        };
      }

      if (response.status === 429) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            answer: 'Too many requests. Please wait a moment and try again.' 
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          answer: `Service temporarily unavailable (${response.status}). Please try again.` 
        })
      };
    }

    // Parse response
    const data = await response.json();
    console.log('AI/ML API response received');

    // Extract answer
    let answer = 'Unable to generate response. Please try again.';
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      answer = data.choices[0].message.content.trim();
    }

    // Log success
    console.log('Answer generated, length:', answer.length);

    // Return success
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ answer })
    };

  } catch (error) {
    console.error('Function error:', error.name, error.message);

    // Handle timeout
    if (error.name === 'AbortError') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          answer: 'Request timeout. Please try asking a simpler question.' 
        })
      };
    }

    // Generic error
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        answer: 'An unexpected error occurred. Please try again.' 
      })
    };
  }
};
