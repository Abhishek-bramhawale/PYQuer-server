const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const AnalysisHistory = require('../models/AnalysisHistory');

const API_BASE_URL = 'https://pyquer-server.onrender.com';

// Send a text prompt to Google Gemini and return the reply
const callGeminiV1Beta = async (prompt, modelName) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  if (!modelName) {
    throw new Error('Gemini model name is not set');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error('Invalid response format from Gemini API');
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini v1beta API Error:', error);
    throw error;
  }
};

// Try primary Gemini model from env; on failure, retry once with fallback model
const callGeminiWithFallback = async (prompt) => {
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

  try {
    console.log(`Using Gemini model: ${primaryModel}`);
    return await callGeminiV1Beta(prompt, primaryModel);
  } catch (primaryError) {
    console.warn(
      `Primary Gemini model (${primaryModel}) failed once. Retrying with fallback (${fallbackModel}):`,
      primaryError.message
    );
    console.log(`Using Gemini fallback model: ${fallbackModel}`);
    return await callGeminiV1Beta(prompt, fallbackModel);
  }
};

// POST /api/ai/gemini — get extra insights from Gemini based on existing analysis text
router.post('/gemini', async (req, res) => {
  try {
    const { analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis text is required' });
    }

    const prompt = `Based on the following analysis, provide additional insights and recommendations:\n\n${analysis}`;
    
    const response = await callGeminiWithFallback(prompt);
    res.json({ response });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: 'Error generating Gemini response' });
  }
});

// Cohere endpoint
router.post('/cohere', async (req, res) => {
  try {
    const { analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis text is required' });
    }

    res.status(501).json({ error: 'Cohere API integration not implemented yet' });
  } catch (error) {
    console.error('Cohere API Error:', error);
    res.status(500).json({ error: 'Error generating Cohere response' });
  }
});

// Mistral endpoint
router.post('/mistral', async (req, res) => {
  try {
    const { analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis text is required' });
    }

    res.status(501).json({ error: 'Mistral API integration not implemented yet' });
  } catch (error) {
    console.error('Mistral API Error:', error);
    res.status(500).json({ error: 'Error generating Mistral response' });
  }
});

// GET /api/ai/history — return all saved analyses for the logged-in user
router.get('/history', protect, async (req, res) => {
  try {
    const history = await AnalysisHistory.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    // Map to include papersText and prompt for frontend
    const mappedHistory = history.map(item => ({
      ...item.toObject(),
      papersText: item.papersText,
      prompt: item.prompt
    }));
    res.json({ history: mappedHistory });
  } catch (error) {
    console.error('Error fetching analysis history:', error);
    res.status(500).json({ error: 'Failed to fetch analysis history' });
  }
});

module.exports = router; 