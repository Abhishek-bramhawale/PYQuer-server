# PYQuer Server (Node/Express)

Backend API for processing uploaded PDF question papers, extracting text (including OCR for non-searchable PDFs), and generating AI analysis using Gemini/Cohere/Mistral apis.

## Features

- JWT authentication and user management
- File uploads using Multer
- PDF parsing with `pdf-parse` and OCR with `tesseract.js`
- AI analysis endpoints: Gemini, Mistral, Cohere
- MongoDB database for analysis storing history

## Requirements

- Node.js 18+ and npm
- MongoDB Atlas 
- API keys: Gemini (required), optional Mistral and Cohere

## Environment Variables

Create `server/.env`:
```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/pyquer?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_here
GEMINI_API_KEY=your_gemini_api_key_here
# Optional for other providers
MISTRAL_API_KEY=your_mistral_api_key_here
COHERE_API_KEY=your_cohere_api_key_here
PORT=5000
```

## Install & Run

```bash
npm install
npm run dev # or npm start
```

Server starts on `http://localhost:5000` by default.

## API Overview

- `POST /api/auth/register` – Register
- `POST /api/auth/login` – Login
- `GET /api/auth/profile` – Get profile (auth)
- `PUT /api/auth/profile` – Update profile (auth)
- `GET /api/auth/users` – List users (auth)
- `DELETE /api/auth/users/:id` – Delete user (auth)
- `POST /api/upload` – Upload PDFs (multipart)
- `POST /api/analyze` – Analyze papers (`model`: gemini|mistral|cohere)
- `GET /api/ai/history` – Get analysis history (auth)
- `GET /api/health` – Health check

## CORS

CORS is configured in `server/index.js`. Update the `origin` allowlist to include your frontend URL(s).

## Storage

Uploaded files are saved under `server/uploads/` temporarily and removed after analysis.

## CI/CD (Render)

This repo includes a GitHub Actions workflow to trigger a Render deploy on pushes to `server/`.

Add the following GitHub repository secrets:
- `RENDER_SERVICE_ID`: Render service ID of this backend
- `RENDER_API_KEY`: Render API key

The workflow `.github/workflows/deploy-server-render.yml` will call Render Deploys API to build and deploy the service.



The application is designed to work with the Easy2Share client service. Make sure it is running and properly configured before using the server application. Github link of client repo is - https://github.com/Abhishek-bramhawale/PYQuer-client
