// AI helper routes — history and optional model endpoints under /api/ai
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const AnalysisHistory = require('../models/AnalysisHistory');

const API_BASE_URL = 'https://pyquer-server.onrender.com';

// Send a text prompt to Google Gemini and return the reply
const callGeminiV1Beta = async (prompt, modelName = 'gemini-2.5-flash') => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
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

// POST /api/ai/gemini — get extra insights from Gemini based on existing analysis text
router.post('/gemini', async (req, res) => {
  try {
    const { analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis text is required' });
    }

    const geminiModelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    console.log(`Using Gemini model: ${geminiModelName}`);
    const prompt = `Based on the following analysis, provide additional insights and recommendations:\n\n${analysis}`;
    
    const response = await callGeminiV1Beta(prompt, geminiModelName);
    res.json({ response });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: 'Error generating Gemini response' });
  }
});

// POST /api/ai/cohere — placeholder, not implemented yet
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

// POST /api/ai/mistral — placeholder, not implemented yet
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