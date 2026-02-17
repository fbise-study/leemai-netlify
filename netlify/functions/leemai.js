exports.handler = async function (event, context) {

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Only POST allowed' }) };
  }

  try {
    const { question, language } = JSON.parse(event.body || '{}');

    if (!question || !question.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Question is required' }) };
    }

    if (!process.env.HF_TOKEN) {
      console.error('HF_TOKEN not set');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ answer: 'Service not configured. Please contact support.' })
      };
    }

    const isUrdu = language === 'ur';

    const prompt = `<s>[INST] You are LeemAI, a helpful study assistant for FBISE students in Pakistan (classes 9-12).
Give clear, simple, accurate answers suitable for high school students.
${isUrdu ? 'Answer in Urdu language.' : 'Answer in simple English.'}
Do not help with cheating.

${question} [/INST]`;

    // Working models to try in order
    const models = [
      'mistralai/Mistral-7B-Instruct-v0.3',
      'HuggingFaceH4/zephyr-7b-beta',
      'google/gemma-2-2b-it',
      'microsoft/Phi-3-mini-4k-instruct'
    ];

    let answer = null;
    let lastError = null;

    for (const model of models) {
      try {
        console.log('Trying model:', model);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(
          `https://api-inference.huggingface.co/models/${model}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.HF_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                max_new_tokens: 400,
                temperature: 0.7,
                return_full_text: false,
                top_p: 0.9
              }
            }),
            signal: controller.signal
          }
        );

        clearTimeout(timeout);

        console.log(`Model ${model} status:`, response.status);

        if (!response.ok) {
          const errText = await response.text();
          console.log(`Model ${model} error:`, errText);
          lastError = `${model}: HTTP ${response.status}`;
          continue; // Try next model
        }

        const data = await response.json();
        console.log(`Model ${model} response:`, JSON.stringify(data).substring(0, 200));

        // Handle model loading
        if (data.error && data.error.includes('loading')) {
          lastError = `${model}: still loading`;
          continue;
        }

        // Extract answer
        let raw = '';
        if (Array.isArray(data) && data[0]?.generated_text) {
          raw = data[0].generated_text;
        } else if (data.generated_text) {
          raw = data.generated_text;
        }

        if (raw && raw.trim().length > 0) {
          // Clean up any prompt echo
          raw = raw.replace(prompt, '').trim();
          // Remove [INST] tags if echoed
          raw = raw.replace(/<s>\[INST\].*?\[\/INST\]/gs, '').trim();
          answer = raw;
          console.log('Got answer from model:', model);
          break; // Success
        }

        lastError = `${model}: empty response`;

      } catch (err) {
        console.log(`Model ${model} threw:`, err.message);
        lastError = `${model}: ${err.message}`;
        continue;
      }
    }

    if (answer && answer.length > 0) {
      // Trim to reasonable length
      if (answer.length > 1500) {
        answer = answer.substring(0, 1500) + '...';
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ answer })
      };
    }

    // All models failed
    console.error('All models failed. Last error:', lastError);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        answer: 'The AI models are currently unavailable or loading. Please try again in 30 seconds. If this keeps happening, the service may be under maintenance.'
      })
    };

  } catch (err) {
    console.error('Handler error:', err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        answer: 'An unexpected error occurred. Please try again.'
      })
    };
  }
};
