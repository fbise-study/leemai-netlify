// FIXED Netlify Function v2 - Better error handling
exports.handler = async function (event, context) {
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Only POST allowed" })
    };
  }

  try {
    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || "{}");
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON in request body" })
      };
    }

    const { question, language } = requestBody;

    // Validate question
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Question is required and must be a non-empty string" })
      };
    }

    console.log('Received question:', question);
    console.log('Language:', language);

    // Check for HF_TOKEN
    if (!process.env.HF_TOKEN) {
      console.error('HF_TOKEN not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: "Configuration error",
          answer: "The AI service is not properly configured. Please contact support."
        })
      };
    }

    const prompt = `You are LeemAI, a helpful study assistant for FBISE students in Pakistan.
Explain concepts in a simple and clear way suitable for high school students.
Answer in ${language === "ur" ? "Urdu" : "simple English"}.
Do NOT help with cheating or provide exam answers.

Question: ${question}

Answer:`;

    console.log('Calling Hugging Face API...');

    // Call Hugging Face API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

    let hfResponse;
    try {
      hfResponse = await fetch(
        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 400,
              temperature: 0.7,
              return_full_text: false,
              top_p: 0.95
            }
          }),
          signal: controller.signal
        }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('Fetch error:', fetchError);
      
      if (fetchError.name === 'AbortError') {
        return {
          statusCode: 504,
          headers,
          body: JSON.stringify({ 
            error: "Request timeout",
            answer: "The AI took too long to respond. Please try asking a simpler question."
          })
        };
      }
      
      throw fetchError;
    }

    clearTimeout(timeoutId);

    console.log('HF Response status:', hfResponse.status);

    // Check if API call was successful
    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error('HF API error:', hfResponse.status, errorText);
      
      // Handle specific error cases
      if (hfResponse.status === 503) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            answer: "The AI model is currently loading. Please wait a moment and try again. (This is normal for the first request)"
          })
        };
      }
      
      if (hfResponse.status === 401) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: "Authentication error",
            answer: "There's a configuration issue with the AI service. Please contact support."
          })
        };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          answer: `Unable to get response from AI (Error ${hfResponse.status}). Please try again.`
        })
      };
    }

    // Parse response
    let data;
    try {
      data = await hfResponse.json();
    } catch (jsonError) {
      console.error('JSON parse error from HF:', jsonError);
      const textResponse = await hfResponse.text();
      console.error('Raw response:', textResponse);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          answer: "Received an invalid response from AI. Please try again."
        })
      };
    }

    console.log('HF Response data:', JSON.stringify(data).substring(0, 200));

    // Extract answer
    let answer = "I couldn't generate a proper response. Please try rephrasing your question.";

    if (Array.isArray(data) && data.length > 0) {
      if (data[0].generated_text) {
        answer = data[0].generated_text
          .replace(prompt, "")
          .trim();
      } else if (data[0].error) {
        console.error('HF returned error:', data[0].error);
        answer = "The AI model encountered an error. Please try again.";
      }
    } else if (data.generated_text) {
      answer = data.generated_text
        .replace(prompt, "")
        .trim();
    } else if (data.error) {
      console.error('HF returned error:', data.error);
      answer = "The AI model encountered an error. Please try again.";
    }

    // Clean up answer
    if (answer.length === 0) {
      answer = "I couldn't generate a response. Please try asking your question differently.";
    }

    // Limit answer length
    if (answer.length > 2000) {
      answer = answer.substring(0, 2000) + "...";
    }

    console.log('Returning answer (length):', answer.length);

    // Return success
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ answer })
    };

  } catch (error) {
    console.error('Unexpected error:', error);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 200, // Return 200 to avoid frontend errors
      headers,
      body: JSON.stringify({ 
        answer: "An unexpected error occurred. Please try again. If the problem persists, contact support.",
        error: error.message
      })
    };
  }
};
